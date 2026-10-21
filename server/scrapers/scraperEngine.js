const TableAdapter = require('./TableAdapter');
const DetailAdapter = require('./DetailAdapter');
const PdfAdapter = require('./PdfAdapter');
const ListingAdapter = require('./ListingAdapter');
const CriteriaParser = require('./CriteriaParser');
const {
  extractAmounts,
  extractAges,
  extractIncomeLimits,
  extractPercentages,
  extractDates,
  extractGoNumbers,
  verifyQuoteInText
} = require('./fieldExtractors');
const Fact = require('../models/Fact');
const mongoose = require('mongoose');

function getDomain(urlStr) {
  try {
    return new URL(urlStr).hostname;
  } catch (e) {
    return 'unknown';
  }
}

/**
 * Executes hybrid scraper engine across adapters, field extractors, and rules.
 * Enforces the Quote Rule and writes facts to the Fact ledger.
 */
async function scrapePage({ html = '', text = '', url = '', schemeId = null, schemeName = '', contentHash = '', isPdf = false }) {
  const contentToSearch = text || html;
  const rawHtml = html || '';
  const domain = getDomain(url);
  const sourceTrust = domain.includes('.gov.in') || domain.includes('.nic.in') ? 'official' : 'reputable';

  const collectedFacts = [];
  let detailBenefit = null;
  let detailDocs = [];
  let detailRules = {};
  let detailGo = null;
  let rawSections = [];
  let unmappedConditions = [];

  // 1. Table Adapter
  try {
    const tableAdapter = new TableAdapter(rawHtml || contentToSearch, url);
    const { rows, facts: tableFacts } = tableAdapter.extractTable();
    tableFacts.forEach(f => collectedFacts.push(f));
  } catch (e) {}

  // 1b. CRA Pension Adapter
  let craPensionSchemes = [];
  try {
    const CraPensionAdapter = require('./CraPensionAdapter');
    const craAdapter = new CraPensionAdapter(rawHtml || contentToSearch, url);
    if (craAdapter.isCraPensionPage()) {
      const { schemes: cSchemes, facts: craFacts } = craAdapter.extractSchemesAndFacts();
      craPensionSchemes = cSchemes;
      
      // Filter facts for the current scheme being scraped if schemeName is provided
      craFacts.forEach(f => {
        if (!schemeName || !f.schemeName || f.schemeName.toLowerCase() === schemeName.toLowerCase() || schemeName.toLowerCase().includes(f.schemeName.toLowerCase()) || f.schemeName.toLowerCase().includes(schemeName.toLowerCase())) {
          collectedFacts.push(f);
        }
      });

      // Find matching pension scheme for benefit and rules
      const matchedCra = craPensionSchemes.find(cs => 
        schemeName && (
          cs.canonicalName.toLowerCase() === schemeName.toLowerCase() ||
          schemeName.toLowerCase().includes(cs.canonicalName.toLowerCase()) ||
          cs.canonicalName.toLowerCase().includes(schemeName.toLowerCase()) ||
          cs.name.toLowerCase() === schemeName.toLowerCase() ||
          schemeName.toLowerCase().includes(cs.name.toLowerCase())
        )
      );

      if (matchedCra) {
        if (matchedCra.amount && !detailBenefit) {
          detailBenefit = `₹${matchedCra.amount.toLocaleString('en-IN')}/month`;
        }
        detailRules = { ...detailRules, ...matchedCra.rules };
        unmappedConditions = [...unmappedConditions, ...(matchedCra.unmapped || [])];
      }
    }
  } catch (e) {}

  // 1c. MyScheme Adapter (for CMCHIS / myscheme.gov.in)
  if (url.includes('myscheme.gov.in') || (typeof contentToSearch === 'string' && (contentToSearch.includes('CMCHIS') || contentToSearch.includes('Chief Minister')) && (contentToSearch.trim().startsWith('{') || contentToSearch.includes('__NEXT_DATA__')))) {
    try {
      const { parseMySchemePayload } = require('./MySchemeAdapter');
      const mySchemeRes = parseMySchemePayload(rawHtml || contentToSearch, url);
      if (mySchemeRes.success) {
        if (mySchemeRes.benefit && !detailBenefit) detailBenefit = mySchemeRes.benefit;
        if (mySchemeRes.documents && mySchemeRes.documents.length > 0) detailDocs = mySchemeRes.documents;
        if (mySchemeRes.incomeLimit) detailRules.income = { $lt: mySchemeRes.incomeLimit };
        mySchemeRes.facts.forEach(f => collectedFacts.push(f));
      }
    } catch (e) {}
  }

  // 2. Detail Adapter
  try {
    const detailAdapter = new DetailAdapter(rawHtml || contentToSearch, url);
    const sections = detailAdapter.extractSections();
    if (sections.benefit && !detailBenefit) detailBenefit = sections.benefit;
    if (sections.requiredDocuments && sections.requiredDocuments.length > 0) detailDocs = sections.requiredDocuments;
    detailRules = { ...detailRules, ...sections.eligibilityRules };
    if (sections.goNumber && !detailGo) detailGo = sections.goNumber;
    if (sections.sections && sections.sections.length > 0) rawSections = sections.sections;
    if (sections.unmappedConditions && sections.unmappedConditions.length > 0) {
      unmappedConditions = [...unmappedConditions, ...sections.unmappedConditions];
    }
    sections.facts.forEach(f => collectedFacts.push(f));
  } catch (e) {}

  // 2b. Application Notices & Deadlines (Section 4)
  let applicationNotice = null;
  try {
    const { extractApplicationNotices } = require('./fieldExtractors');
    const notices = extractApplicationNotices(contentToSearch);
    if (notices.length > 0) {
      applicationNotice = notices[0];
      collectedFacts.push({
        field: 'applicationStatus',
        value: applicationNotice.status,
        quote: applicationNotice.quote,
        date: applicationNotice.date,
        confidence: 0.95,
        extractedBy: 'regex'
      });
    }
  } catch (e) {}

  // 3. PDF Adapter (if PDF)
  if (isPdf || url.toLowerCase().endsWith('.pdf')) {
    try {
      const pdfAdapter = new PdfAdapter(contentToSearch, url);
      const pdfFields = pdfAdapter.extractFields();
      if (pdfFields.benefit && !detailBenefit) detailBenefit = pdfFields.benefit;
      if (pdfFields.goNumber && !detailGo) detailGo = pdfFields.goNumber;
      pdfFields.facts.forEach(f => collectedFacts.push(f));
    } catch (e) {}
  }

  // 4. Deduplicate and validate Quote Rule
  const uniqueFacts = [];
  const seenFactKeys = new Set();

  for (const fact of collectedFacts) {
    if (!fact.quote || !fact.field) continue;

    // Quote Rule: quote must exist in source text or rawHtml
    const hasQuote = verifyQuoteInText(fact.quote, contentToSearch) || 
                     (rawHtml && verifyQuoteInText(fact.quote, rawHtml)) ||
                     contentToSearch.toLowerCase().includes(fact.quote.toLowerCase()) ||
                     (rawHtml && rawHtml.toLowerCase().includes(fact.quote.toLowerCase()));
    if (!hasQuote) continue;

    const key = `${fact.field}:${JSON.stringify(fact.value)}:${fact.quote.substring(0, 30)}`;
    if (seenFactKeys.has(key)) continue;
    seenFactKeys.add(key);

    uniqueFacts.push({
      ...fact,
      confidence: fact.confidence || 0.95
    });
  }

  // 5. Counts by method
  const countsByMethod = { selector: 0, regex: 0, rules: 0 };
  let totalConfidence = 0;

  uniqueFacts.forEach(f => {
    const m = f.extractedBy || 'regex';
    if (countsByMethod[m] !== undefined) {
      countsByMethod[m]++;
    } else {
      countsByMethod.regex++;
    }
    totalConfidence += (f.confidence || 0.9);
  });

  const avgConfidence = uniqueFacts.length > 0 ? (totalConfidence / uniqueFacts.length) : 0;

  // 6. Persist to Fact Evidence Ledger if schemeId provided and DB is connected
  if (schemeId && uniqueFacts.length > 0 && mongoose.connection.readyState === 1) {
    try {
      for (const f of uniqueFacts) {
        await Fact.findOneAndUpdate(
          {
            schemeId,
            field: f.field,
            quote: f.quote
          },
          {
            schemeId,
            field: f.field,
            value: f.value,
            quote: f.quote,
            sourceUrl: url,
            sourceDomain: domain,
            sourceTrust,
            contentHash: contentHash || 'nohash',
            extractedBy: f.extractedBy || 'regex',
            confidence: Math.round((f.confidence || 0.95) * 100),
            fetchedAt: new Date()
          },
          { upsert: true, new: true }
        ).catch(() => {});
      }
    } catch (dbErr) {}
  }

  // 7. Status classification
  let status = 'awaiting_ai';
  let awaitingAi = false;

  if (uniqueFacts.length >= 2 || (uniqueFacts.length >= 1 && detailBenefit)) {
    status = 'ok';
  } else if (uniqueFacts.length === 1) {
    status = 'partial';
  } else {
    status = 'awaiting_ai';
    awaitingAi = true;
  }

  return {
    status,
    awaitingAi,
    facts: uniqueFacts,
    countsByMethod,
    confidence: Number(avgConfidence.toFixed(2)),
    benefit: detailBenefit,
    docs: detailDocs,
    eligibilityRules: detailRules,
    goNumber: detailGo,
    applicationNotice,
    sections: rawSections,
    unmapped: unmappedConditions
  };
}

module.exports = {
  scrapePage,
  TableAdapter,
  DetailAdapter,
  PdfAdapter,
  ListingAdapter,
  CriteriaParser
};
