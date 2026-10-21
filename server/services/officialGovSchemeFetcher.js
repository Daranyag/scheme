const cheerio = require('cheerio');
const mongoose = require('mongoose');
const { fetchPage } = require('../lib/fetcher');
const Scheme = require('../models/Scheme');
const Fact = require('../models/Fact');
const DetailAdapter = require('../scrapers/DetailAdapter');
const apicache = require('apicache');

/**
 * Fetches schemes from https://www.tn.gov.in/scheme_wise.php and official detail pages,
 * extracts verified details and quoted facts, and stores them in the database.
 */
async function fetchAndStoreOfficialGovSchemes(maxSchemes = 25) {
  console.log('[OfficialGovFetcher] Fetching official directory: https://www.tn.gov.in/scheme_wise.php ...');
  
  const mainUrl = 'https://www.tn.gov.in/scheme_wise.php';
  const mainPage = await fetchPage(mainUrl);
  
  if (!mainPage.ok || !mainPage.rawHtml) {
    throw new Error(`Failed to fetch official portal ${mainUrl}: ${mainPage.errorMessage || mainPage.errorType}`);
  }

  const $ = cheerio.load(mainPage.rawHtml);
  const candidateLinks = [];

  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (href.includes('scheme_details.php?id=') && text.length > 3) {
      const fullUrl = href.startsWith('http') ? href : `https://www.tn.gov.in/${href.replace(/^\//, '')}`;
      candidateLinks.push({ name: text, url: fullUrl });
    }
  });

  console.log(`[OfficialGovFetcher] Discovered ${candidateLinks.length} official schemes in directory.`);
  // Find which candidate schemes already exist in database to avoid redundant network calls
  const candidateUrls = candidateLinks.map(c => c.url);
  const existingSchemes = await Scheme.find({
    sourceUrl: { $in: candidateUrls }
  }).select('sourceUrl name fetchedAt').lean();

  const existingMap = new Map();
  for (const s of existingSchemes) {
    existingMap.set(s.sourceUrl, s);
  }

  // Prioritize new/unindexed schemes first, followed by schemes not fetched today
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const unindexed = [];
  const needsRefresh = [];

  for (const c of candidateLinks) {
    const existing = existingMap.get(c.url);
    if (!existing) {
      unindexed.push(c);
    } else if (!existing.fetchedAt || new Date(existing.fetchedAt) < oneDayAgo) {
      needsRefresh.push(c);
    }
  }

  // Combine prioritizing unindexed schemes
  const prioritizedCandidates = [...unindexed, ...needsRefresh, ...candidateLinks].filter((v, i, a) => a.findIndex(t => t.url === v.url) === i);
  const toProcess = prioritizedCandidates.slice(0, maxSchemes);

  const results = {
    totalDiscovered: candidateLinks.length,
    processed: 0,
    added: 0,
    updated: 0,
    factsCreated: 0,
    schemes: []
  };

  async function processSchemeItem(item) {
    try {
      results.processed++;
      const nameTrim = item.name.trim().toLowerCase();
      // Skip pure department/agency names that are not individual citizen welfare schemes
      if (nameTrim === 'tnega' || 
          nameTrim === 'elcot' || 
          nameTrim === 'tidco' || 
          nameTrim === 'sipcot' || 
          nameTrim.startsWith('information technology and digital services department') ||
          nameTrim.startsWith('தகவல் தொழில்நுட்பவியல் மற்றும் டிஜிட்டல் சேவைகள் துறை')) {
        console.log(`[OfficialGovFetcher] Skipping non-scheme department entry: "${item.name}"`);
        return;
      }

      const detailPage = await fetchPage(item.url);
      if (!detailPage.ok || !detailPage.text) {
        return;
      }

      const $d = cheerio.load(detailPage.rawHtml || '');
      const rawText = detailPage.text;

      let schemeName = item.name;
      let department = 'Social Welfare';
      let benefit = '';
      let beneficiaries = '';
      let howToAvail = '';
      let description = '';

      const fieldMap = {};
      $d('tr').each((_, tr) => {
        const tds = $d(tr).find('td');
        if (tds.length >= 2) {
          const k = $d(tds[0]).text().replace(/\s+/g, ' ').trim().toLowerCase();
          const v = $d(tds[1]).text().replace(/\s+/g, ' ').trim();
          if (k && v) {
            fieldMap[k] = v;
          }
        }
      });

      function cleanField(val, stopLabels = []) {
        if (!val) return '';
        let s = val;
        for (const stop of stopLabels) {
          const idx = s.indexOf(stop);
          if (idx !== -1) s = s.substring(0, idx);
        }
        return s.replace(/\s+/g, ' ').trim();
      }

      const stopList = [
        'Associated Scheme:', 'Sponsered By:', 'State Funding Pattern:',
        'Beneficiaries:', 'Types of Benefits:', 'Eligibility criteria:',
        'Income:', 'Age From:', 'Age To:', 'Community:', 'How To avail:',
        'Validity of the Scheme:', 'Introduced On:', 'Description:',
        'Scheme Type:', 'Uploaded File:', 'Concerned District:', 'Organisation Name:'
      ];

      for (const [k, v] of Object.entries(fieldMap)) {
        if (k.includes('title') || k.includes('scheme name')) schemeName = cleanField(v, stopList);
        if (k.includes('department')) department = cleanField(v, stopList);
        if (k.includes('benefit')) benefit = cleanField(v, stopList);
        if (k.includes('beneficiar')) beneficiaries = cleanField(v, stopList);
        if (k.includes('how to avail')) howToAvail = cleanField(v, stopList);
        if (k.includes('description')) description = cleanField(v, stopList);
      }

      if (!fieldMap['scheme title/name']) {
        const nameMatch = rawText.match(/Scheme Title\/Name:\s*([^\n\r]+)/i);
        if (nameMatch && nameMatch[1]) schemeName = cleanField(nameMatch[1], stopList);
      }

      if (!fieldMap['concerned department']) {
        const deptMatch = rawText.match(/Concerned Department:\s*([^\n\r]+)/i);
        if (deptMatch && deptMatch[1]) department = cleanField(deptMatch[1], stopList);
      }

      if (!benefit) {
        const benefitMatch = rawText.match(/Types of Benefits:\s*([^\n\r]+)/i);
        if (benefitMatch && benefitMatch[1]) benefit = cleanField(benefitMatch[1], stopList);
      }

      if (!description) {
        const descMatch = rawText.match(/Description:\s*([^\n\r]+)/i);
        if (descMatch && descMatch[1]) description = cleanField(descMatch[1], stopList);
      }

      if (!beneficiaries) {
        const benefMatch = rawText.match(/Beneficiaries:\s*([^\n\r]+)/i);
        if (benefMatch && benefMatch[1]) beneficiaries = cleanField(benefMatch[1], stopList);
      }

      if (!howToAvail) {
        const availMatch = rawText.match(/How To avail:\s*([^\n\r]+)/i);
        if (availMatch && availMatch[1]) howToAvail = cleanField(availMatch[1], stopList);
      }

      const adapter = new DetailAdapter(detailPage.rawHtml, item.url);
      const parsed = adapter.extractSections();

      // Prioritize the actual "Types of Benefits" field if present; fallback to parsed.benefit or description
      let finalBenefit = benefit;
      if (!finalBenefit || finalBenefit === 'Official state welfare assistance') {
        finalBenefit = parsed.benefit || description || 'Official state welfare assistance and financial aid';
      }

      // If description contains complementary details not already in benefit, combine them cleanly
      if (description && finalBenefit && !description.includes(finalBenefit) && !finalBenefit.includes(description)) {
        if (finalBenefit.length < 120) {
          finalBenefit = `${finalBenefit}. ${description}`;
        }
      }

      const primaryQuote = finalBenefit || description || rawText.substring(0, 200).replace(/\s+/g, ' ').trim();

      const rules = { ...parsed.eligibilityRules };
      if (beneficiaries.toLowerCase().includes('sc') || beneficiaries.toLowerCase().includes('st')) {
        rules.community = 'SC/ST';
      }
      if (beneficiaries.toLowerCase().includes('women') || beneficiaries.toLowerCase().includes('girl')) {
        rules.gender = 'F';
      }

      const ageMatch = rawText.match(/Age From:\s*(\d+)/i) || rawText.match(/minimum age\D*(\d+)/i);
      if (ageMatch && parseInt(ageMatch[1], 10) > 0) {
        rules.age = { $gte: parseInt(ageMatch[1], 10) };
      }

      const incomeMatch = rawText.match(/Income:\D*Rs\.?\s*([\d,]+)/i);
      if (incomeMatch) {
        const incVal = parseInt(incomeMatch[1].replace(/,/g, ''), 10);
        if (incVal > 0) rules.income = { $lt: incVal };
      }

      if (beneficiaries.toLowerCase().includes('student') || rawText.toLowerCase().includes('students studying') || rawText.toLowerCase().includes('school')) {
        rules.student = true;
      }

      const benefLower = beneficiaries.toLowerCase();
      const textLower = rawText.toLowerCase();

      // Check Farmer / Agricultural beneficiary rules
      if (benefLower.includes('farmer') || benefLower.includes('agriculture') || textLower.includes('target beneficiaries: farmers')) {
        rules.targetOccupation = 'farmer';
      } else if (benefLower.includes('agricultural labourer') || benefLower.includes('farm labour')) {
        rules.targetOccupation = 'agricultural_labourer';
      }

      // Check Widow / Destitute Widow beneficiary rules
      if (benefLower.includes('widow')) {
        rules.marital = 'Widowed';
      }

      // Check Folk Artiste / Artisan / Handloom / Weaver rules
      if (benefLower.includes('folk artiste') || benefLower.includes('artist')) {
        rules.workerType = 'folk_artiste';
      } else if (benefLower.includes('weaver') || benefLower.includes('handloom')) {
        rules.workerType = 'weaver';
      }

      // Check Journalist rules
      if (benefLower.includes('journalist') || schemeName.toLowerCase().includes('journalist')) {
        rules.targetProfession = 'journalist';
      }

      let schemeDoc = await Scheme.findOne({
        $or: [
          { name: schemeName },
          { sourceUrl: item.url }
        ]
      });

      if (!schemeDoc) {
        schemeDoc = new Scheme({
          name: schemeName,
          category: department.includes('Tribal') || department.includes('Adi Dravidar') 
            ? 'Welfare' 
            : (department.includes('Labour') ? 'Workers' : 'Social Welfare'),
          department: department,
          benefit: finalBenefit,
          rules: rules,
          eligibilityRules: parsed.eligibilityRules || {},
          unmappedCriteria: beneficiaries ? [`Target Beneficiaries: ${beneficiaries}`] : [],
          howToApply: howToAvail ? [howToAvail, 'Submit application along with required documents at the concerned department / Taluk / e-Sevai office'] : ['Visit your local Taluk office or e-Sevai centre with required documents', 'Submit application form to the concerned Department officer'],
          requiredDocuments: parsed.requiredDocuments.length > 0 ? parsed.requiredDocuments : ['Aadhaar Card', 'Ration Card', 'Bank Passbook'],
          links: [{ title: 'Official TN Government Portal', url: item.url }],
          officialLinks: [{ title: 'Official TN Government Portal', url: item.url }],
          sourceUrl: item.url,
          rawSourceText: rawText.substring(0, 4000),
          origin: 'live',
          createdBy: 'officialGovFetcher',
          status: 'ACTIVE',
          reviewStatus: 'approved',
          confirmationLevel: 'confirmed by 1 official source',
          confirmingSources: [item.url, mainUrl],
          sourceTrustLevel: 'official',
          displayState: 'confirmed',
          verificationStatus: 'confirmed',
          verificationLevel: 'official',
          verify: true,
          lastVerified: new Date().toISOString(),
          fetchedAt: new Date()
        });
        await schemeDoc.save();
        results.added++;
      } else {
        schemeDoc.benefit = finalBenefit || schemeDoc.benefit;
        schemeDoc.department = department || schemeDoc.department;
        schemeDoc.rules = { ...schemeDoc.rules, ...rules };
        if (howToAvail && (!schemeDoc.howToApply || schemeDoc.howToApply.length <= 1)) {
          schemeDoc.howToApply = [howToAvail, 'Submit application along with required documents at the concerned department / Taluk / e-Sevai office'];
        }
        schemeDoc.reviewStatus = 'approved';
        schemeDoc.status = 'ACTIVE';
        schemeDoc.fetchedAt = new Date();
        if (!schemeDoc.confirmingSources.includes(item.url)) {
          schemeDoc.confirmingSources.push(item.url);
        }
        await schemeDoc.save();
        results.updated++;
      }

      const factsToInsert = [];
      if (primaryQuote) {
        factsToInsert.push({
          schemeId: schemeDoc._id,
          field: 'benefit',
          value: benefit,
          quote: primaryQuote.substring(0, 300),
          sourceUrl: item.url,
          sourceDomain: 'tn.gov.in',
          sourceTrust: 'official',
          contentHash: 'hash_' + schemeDoc._id,
          extractedBy: 'selector',
          confidence: 95
        });
      }

      for (const fact of parsed.facts.slice(0, 3)) {
        factsToInsert.push({
          schemeId: schemeDoc._id,
          field: fact.field || 'criteria',
          value: fact.value,
          quote: fact.quote,
          sourceUrl: item.url,
          sourceDomain: 'tn.gov.in',
          sourceTrust: 'official',
          contentHash: 'hash_' + schemeDoc._id + '_' + fact.field,
          extractedBy: fact.extractedBy || 'selector',
          confidence: Math.round((fact.confidence || 0.9) * 100)
        });
      }

      for (const f of factsToInsert) {
        await Fact.findOneAndUpdate(
          { schemeId: f.schemeId, field: f.field, quote: f.quote },
          f,
          { upsert: true }
        );
        results.factsCreated++;
      }

      results.schemes.push({
        id: schemeDoc._id,
        name: schemeDoc.name,
        department: schemeDoc.department,
        benefit: schemeDoc.benefit,
        sourceUrl: schemeDoc.sourceUrl,
        factsCount: factsToInsert.length
      });
    } catch (itemErr) {
      console.warn(`[OfficialGovFetcher] Error processing ${item.name}: ${itemErr.message}`);
    }
  }

  // Concurrently process candidate schemes in parallel batches of 5 for high speed
  const BATCH_SIZE = 5;
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(item => processSchemeItem(item)));
  }

  // Clear API cache so data monitoring immediately shows updated numbers
  try {
    apicache.clear();
  } catch (_) {}
  try {
    const { invalidateCache } = require('../lib/schemesCache');
    invalidateCache();
  } catch (_) {}

  console.log(`[OfficialGovFetcher] Completed. Added: ${results.added}, Updated: ${results.updated}, Facts created: ${results.factsCreated}`);
  return results;
}

/**
 * Checks if a URL strictly belongs to Tamil Nadu government portals or allowed official domains.
 */
function isTamilNaduGovUrl(inputUrl) {
  if (!inputUrl) return false;
  try {
    const parsed = new URL(inputUrl.startsWith('http') ? inputUrl : `https://${inputUrl}`);
    const host = parsed.hostname.toLowerCase();
    
    // Strict domain check: must end with tn.gov.in or nic.in, or be an official TN board portal
    const allowedTNDomains = [
      'tn.gov.in',
      'nic.in',
      'cmchistn.com',
      'tnnhis2018.in',
      'tnagriculture.in',
      'makkalteadi.tn.gov.in',
      'cra.tn.gov.in',
      'karuvoolam.tn.gov.in',
      'tnesevai.tn.gov.in',
      'umis.tn.gov.in',
      'naanmudhalvan.tn.gov.in',
      'kmut.tn.gov.in'
    ];

    return allowedTNDomains.some(domain => host === domain || host.endsWith('.' + domain));
  } catch (_) {
    return false;
  }
}

/**
 * Fetches schemes or scheme data from a user-specified Tamil Nadu government URL
 */
async function fetchFromCustomSource(targetUrl) {
  if (!targetUrl) throw new Error('Target URL is required.');

  const normalizedUrl = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;
  if (!isTamilNaduGovUrl(normalizedUrl)) {
    throw new Error('Only official Tamil Nadu Government sources (*.tn.gov.in, *.nic.in, or verified TN portals) are permitted.');
  }

  console.log(`[OfficialGovFetcher] Fetching custom TN source: ${normalizedUrl} ...`);
  const page = await fetchPage(normalizedUrl);
  if (!page.ok || !page.rawHtml) {
    throw new Error(`Failed to fetch ${normalizedUrl}: ${page.errorMessage || page.errorType}`);
  }

  const $ = cheerio.load(page.rawHtml);
  const parsedHost = new URL(normalizedUrl).hostname;

  // Check if page contains multiple scheme links (like directory or table)
  const candidateLinks = [];
  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if ((href.includes('scheme') || href.includes('details') || href.includes('welfare') || href.includes('programme')) && text.length >= 4) {
      let full = href;
      if (!href.startsWith('http')) {
        try {
          full = new URL(href, normalizedUrl).toString();
        } catch (_) {}
      }
      if (isTamilNaduGovUrl(full)) {
        candidateLinks.push({ name: text, url: full });
      }
    }
  });

  const results = {
    sourceUrl: normalizedUrl,
    domain: parsedHost,
    added: 0,
    updated: 0,
    factsCreated: 0,
    schemes: []
  };

  // If page is itself a single scheme detail page or contains text
  const pageTitle = $('h1, h2, title').first().text().replace(/\s+/g, ' ').trim() || 'Tamil Nadu Welfare Initiative';
  const rawText = page.text || $('body').text().replace(/\s+/g, ' ').trim();

  // Extract from current page using DetailAdapter
  const adapter = new DetailAdapter(page.rawHtml, normalizedUrl);
  const parsed = adapter.extractSections();
  const benefit = parsed.benefit || $('p').filter((_, el) => $(el).text().length > 30).first().text().trim() || 'Official Tamil Nadu State Welfare Benefit';
  const schemeName = parsed.name || pageTitle;

  if (rawText.length > 50) {
    let schemeDoc = await Scheme.findOne({
      $or: [
        { name: schemeName },
        { sourceUrl: normalizedUrl }
      ]
    });

    const department = parsed.department || (parsedHost.includes('socialwelfare') ? 'Social Welfare' : (parsedHost.includes('agri') ? 'Agriculture' : 'Tamil Nadu Government'));

    if (!schemeDoc) {
      schemeDoc = new Scheme({
        name: schemeName,
        category: 'Welfare',
        department: department,
        benefit: benefit,
        rules: parsed.eligibilityRules || {},
        eligibilityRules: parsed.eligibilityRules || {},
        unmappedCriteria: [],
        howToApply: parsed.howToApply && parsed.howToApply.length > 0 ? parsed.howToApply : [`Apply at official portal: ${normalizedUrl}`],
        requiredDocuments: parsed.requiredDocuments && parsed.requiredDocuments.length > 0 ? parsed.requiredDocuments : ['Aadhaar Card', 'Ration Card'],
        links: [{ title: 'Official Source', url: normalizedUrl }],
        officialLinks: [{ title: 'Official Source', url: normalizedUrl }],
        sourceUrl: normalizedUrl,
        rawSourceText: rawText.substring(0, 4000),
        origin: 'live',
        createdBy: 'user_custom_tn_fetch',
        status: 'ACTIVE',
        reviewStatus: 'approved',
        confirmationLevel: 'confirmed by 1 official source',
        confirmingSources: [normalizedUrl],
        sourceTrustLevel: 'official',
        displayState: 'confirmed',
        verificationStatus: 'confirmed',
        verificationLevel: 'official',
        verify: true,
        lastVerified: new Date().toISOString(),
        fetchedAt: new Date()
      });
      await schemeDoc.save();
      results.added++;
    } else {
      schemeDoc.benefit = benefit || schemeDoc.benefit;
      schemeDoc.department = department || schemeDoc.department;
      schemeDoc.reviewStatus = 'approved';
      schemeDoc.status = 'ACTIVE';
      schemeDoc.fetchedAt = new Date();
      if (!schemeDoc.confirmingSources.includes(normalizedUrl)) {
        schemeDoc.confirmingSources.push(normalizedUrl);
      }
      await schemeDoc.save();
      results.updated++;
    }

    // Insert fact with quote
    const factQuote = rawText.substring(0, 250).trim();
    if (factQuote) {
      await Fact.findOneAndUpdate(
        { schemeId: schemeDoc._id, field: 'benefit', sourceUrl: normalizedUrl },
        {
          schemeId: schemeDoc._id,
          field: 'benefit',
          value: benefit,
          quote: factQuote,
          sourceUrl: normalizedUrl,
          sourceDomain: parsedHost,
          sourceTrust: 'official',
          contentHash: 'hash_' + schemeDoc._id + '_user',
          extractedBy: 'selector',
          confidence: 95
        },
        { upsert: true }
      );
      results.factsCreated++;
    }

    results.schemes.push({
      id: schemeDoc._id,
      name: schemeDoc.name,
      department: schemeDoc.department,
      benefit: schemeDoc.benefit,
      sourceUrl: normalizedUrl
    });
  }

  // Clear cache
  try {
    apicache.clear();
  } catch (_) {}
  try {
    const { invalidateCache } = require('../lib/schemesCache');
    invalidateCache();
  } catch (_) {}

  return results;
}

/**
 * Fetches schemes from all configured official sources in sources.json
 */
async function fetchFromAllOfficialSources() {
  const sourcesConfig = require('../sources.json');
  const officialPages = sourcesConfig.officialPages || [];
  
  const results = {
    totalSources: officialPages.length,
    processed: 0,
    added: 0,
    updated: 0,
    sourcesResults: []
  };

  // Run official directory fetch first
  try {
    const dirRes = await fetchAndStoreOfficialGovSchemes(30);
    results.added += dirRes.added;
    results.updated += dirRes.updated;
  } catch (err) {
    console.warn('[OfficialGovFetcher] Directory fetch error:', err.message);
  }

  // Crawl official pages listed in sources.json in parallel batches
  const otherPages = officialPages.filter(page => page.url && !page.url.includes('scheme_wise.php'));
  const BATCH_SIZE = 4;
  for (let i = 0; i < otherPages.length; i += BATCH_SIZE) {
    const batch = otherPages.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (page) => {
      try {
        results.processed++;
        const res = await fetchFromCustomSource(page.url);
        results.added += res.added;
        results.updated += res.updated;
        results.sourcesResults.push({ name: page.name, url: page.url, success: true });
      } catch (e) {
        results.sourcesResults.push({ name: page.name, url: page.url, success: false, error: e.message });
      }
    }));
  }

  return results;
}

module.exports = {
  fetchAndStoreOfficialGovSchemes,
  fetchFromCustomSource,
  fetchFromAllOfficialSources,
  isTamilNaduGovUrl
};

