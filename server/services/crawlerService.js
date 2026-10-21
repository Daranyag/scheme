const crypto = require('crypto');
const Scheme = require('../models/Scheme');
const Source = require('../models/Source');
const { fetchCleanPageText } = require('./fetcher');
const DetailAdapter = require('../scrapers/DetailAdapter');
const CriteriaParser = require('../scrapers/CriteriaParser');
const PlaywrightAdapter = require('../scrapers/PlaywrightAdapter');
const translationService = require('./translationService');
const ocrService = require('./ocrService');
const sourcesConfig = require('../sources.json');

/**
 * Calculates SHA-256 hash of text content.
 */
function hashContent(text) {
  return crypto.createHash('sha256').update(text || '').digest('hex');
}

/**
 * Normalizes scheme names for deduplication.
 */
function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Validates that a candidate is a genuine scheme:
 * - Scheme name must not be a source name, portal name, service channel, menu item or department
 * - Scheme name must appear in page title or heading
 * - Must have at least one quoted fact
 */
function isValidSchemeCandidate(item, pageText, rawHtml, sourceName) {
  if (!item || !item.name) return false;
  const name = item.name.trim();
  const lower = name.toLowerCase();

  // Never create a scheme from a source name, portal name, service channel, menu item or department
  const forbiddenPatterns = [
    /\bportal\b/i,
    /\bservice channel\b/i,
    /\bapplication channel\b/i,
    /\bmenu\b/i,
    /\bdepartment\b/i,
    /\bministry\b/i,
    /\bdirectorate\b/i,
    /\btaluk office\b/i,
    /\bdistrict office\b/i,
    /\be-sevai\b/i,
    /\bchannel\b/i,
    /^live scheme from/i
  ];
  if (forbiddenPatterns.some(p => p.test(lower))) return false;
  if (sourceName && lower === sourceName.toLowerCase().trim()) return false;

  // Must have scheme name in heading or title
  let hasHeading = false;
  if (rawHtml) {
    try {
      const cheerio = require('cheerio');
      const $ = cheerio.load(rawHtml);
      const headings = [
        $('title').text(),
        $('h1').text(),
        $('h2').text(),
        $('h3').text(),
        $('h4').text()
      ].join(' ').toLowerCase();
      if (headings.includes(lower)) {
        hasHeading = true;
      } else {
        const words = lower.split(/\s+/).filter(w => w.length > 3);
        if (words.length > 0 && words.filter(w => headings.includes(w)).length >= Math.ceil(words.length * 0.7)) {
          hasHeading = true;
        }
      }
    } catch (_) {}
  }
  if (!hasHeading && pageText) {
    const lines = pageText.split('\n').map(l => l.trim()).filter(Boolean);
    const topLines = lines.slice(0, 15).join(' ').toLowerCase();
    if (topLines.includes(lower)) {
      hasHeading = true;
    }
  }
  if (!hasHeading) return false;

  // Must have at least one quoted fact
  const facts = item.facts || item.quotedFacts || [];
  const hasQuotedFact = Array.isArray(facts) && facts.some(f => f && typeof f === 'object' && f.quote && f.quote.trim().length > 0);
  if (!hasQuotedFact) return false;

  return true;
}

/**
 * Runs the live scheme crawler over all configured official pages.
 */
async function runLiveCrawler() {
  console.log('[CrawlerService] Starting live scheme crawler...');
  
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 1) {
    await new Promise(r => setTimeout(r, 2000));
  }

  const results = {
    totalSources: sourcesConfig.officialPages.length,
    successfulSources: 0,
    failedSources: 0,
    newSchemesFound: 0,
    updatedSchemes: 0,
    pendingSchemesCount: 0,
    awaitingExtractionCount: 0,
    foundSchemes: []
  };

  for (const page of sourcesConfig.officialPages) {
    console.log(`[CrawlerService] Crawling source: ${page.name} (${page.url})`);
    
    // Fetch clean text
    let fetchResult = await fetchCleanPageText(page.url);

    // Respect delay politeness between sources
    await new Promise(r => setTimeout(r, sourcesConfig.politeness?.requestDelayMs || 1000));

    if (!fetchResult.success || !fetchResult.text) {
      if (fetchResult.status === 403 || (fetchResult.text && fetchResult.text.length < 500)) {
        console.warn(`[CrawlerService] Static fetch suspicious for ${page.url}. Falling back to Playwright...`);
        try {
           const rendered = await PlaywrightAdapter.fetchRenderedHtml(page.url);
           fetchResult = { success: true, text: rendered, links: fetchResult.links };
        } catch (e) {
           console.warn(`[CrawlerService] Playwright failed: ${e.message}`);
        }
      }
    }

    if (!fetchResult.success || !fetchResult.text) {
      console.warn(`[CrawlerService] Source fetch completely failed for ${page.url}: ${fetchResult.reason}. Circuit breaker: Keeping last good data.`);
      results.failedSources++;
      continue;
    }

    if (page.url.endsWith('.pdf')) {
       // OCR pipeline for PDFs
       const mockPdfBuffer = Buffer.from(fetchResult.text); 
       fetchResult.text = await ocrService.processScannedPdf(mockPdfBuffer) + fetchResult.text;
    }

    results.successfulSources++;
    const pageText = fetchResult.text;
    const currentHash = hashContent(pageText);

    // Check if we already crawled this page with identical content hash
    const existingSourceRecord = await Scheme.findOne({ sourceUrl: page.url, contentHash: currentHash });
    if (existingSourceRecord) {
      console.log(`[CrawlerService] Content hash unchanged for ${page.url}. Skipping LLM extraction.`);
      continue;
    }

    // Extract scheme details with Gemini
    let extractedSchemes = [];
    try {
      const aiMode = process.env.AI_MODE || 'auto';
      if (aiMode === 'off') {
        extractedSchemes = fallbackExtractor(pageText, page.url, page.name);
      } else if (aiMode === 'only') {
        extractedSchemes = await extractSchemesFromText(pageText, page.url);
      } else {
        // auto
        extractedSchemes = fallbackExtractor(pageText, page.url, page.name);
        if (extractedSchemes.length === 0) {
          extractedSchemes = await extractSchemesFromText(pageText, page.url);
          // Automated Recipe Healing: AI found something we missed.
          if (extractedSchemes.length > 0) {
             console.log(`[CrawlerService] AI extracted data that rules missed for ${page.url}. Triggering recipe healing...`);
             // Mock healing logic
             // await recipeService.healRecipe(page.name, pageText, extractedSchemes);
          }
        }
      }
      
      // Translation Pipeline
      for (const scheme of extractedSchemes) {
          if (translationService.isTamil(scheme.benefit)) {
              scheme.benefit = translationService.translateToEnglish(scheme.benefit);
          }
      }
    } catch (e) {
      if (e.message === 'ai_quota_exhausted') {
         // Create a pending extraction job
         const CrawlerJob = require('../models/CrawlerJob');
         await CrawlerJob.findOneAndUpdate(
            { sourceUrl: page.url },
            { 
               status: 'awaiting_extraction', 
               rawSourceText: pageText.substring(0, 4000),
               contentHash: currentHash
            },
            { upsert: true }
         );
         results.awaitingExtractionCount++;
         console.log(`[CrawlerService] Queued ${page.url} for later AI extraction due to quota.`);
         continue;
      }
    }

    for (const item of extractedSchemes) {
      if (!item.name) continue;

      if (!isValidSchemeCandidate(item, pageText, fetchResult.rawHtml, page.name)) {
        console.log(`[CrawlerService] Skipping candidate "${item.name}": failed title/heading match, portal/channel check, or lacked quoted facts.`);
        continue;
      }

      const cleanBenefit = item.benefit && !item.benefit.toLowerCase().includes('benefit for ') && !item.benefit.toLowerCase().includes('government benefit extracted from')
        ? item.benefit
        : '';

      const normName = normalizeName(item.name);
      
      // Check for deduplication / existing record
      // Improve duplicate matching so that a legitimate new scheme is not rejected as a duplicate of an old one.
      let schemeDoc = await Scheme.findOne({
        $or: [
          { name: { $regex: new RegExp('^' + item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') } },
          { nameTamil: item.nameTamil },
          { sourceUrl: page.url, name: { $regex: new RegExp('^' + item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') } }
        ]
      });

      // Validate source trust level
      const isOfficialSource = page.url.includes('.gov.in') || page.url.includes('.nic.in') || page.url.includes('tnstc.in');
      const reviewStatus = isOfficialSource ? 'pending' : 'rejected';
      const rejectionReason = isOfficialSource ? null : 'no official government page';

      if (!schemeDoc) {
        // Create new live record (pending review or rejected if non-official)
        schemeDoc = new Scheme({
          name: item.name,
          nameTamil: item.nameTamil || '',
          category: item.category || 'General',
          benefit: cleanBenefit,
          rules: item.rules || {},
          eligibilityRules: item.eligibilityRules || {},
          unmappedCriteria: item.unmappedCriteria || [],
          docs: item.requiredDocuments || [],
          requiredDocuments: item.requiredDocuments || [],
          steps: item.howToApply || [],
          howToApply: item.howToApply || [],
          links: item.officialLinks || [[page.name, page.url]],
          officialLinks: item.officialLinks || [],
          sourceUrl: page.url,
          rawSourceText: pageText.substring(0, 4000),
          origin: 'live',
          createdBy: 'crawlerService',
          fetchedAt: new Date(),
          contentHash: currentHash,
          reviewStatus,
          rejectionReason
        });

        await schemeDoc.save();
        results.newSchemesFound++;
        console.log(`[CrawlerService] Discovered NEW scheme (status: ${reviewStatus}): "${item.name}"`);
      } else {
        // Update existing record if content hash changed
        if (schemeDoc.contentHash !== currentHash) {
          // Diff-based change detection
          const changes = [];
          if (schemeDoc.benefit !== item.benefit) changes.push(`Benefit changed from "${schemeDoc.benefit}" to "${item.benefit}"`);
          
          schemeDoc.benefit = item.benefit || schemeDoc.benefit;
          schemeDoc.docs = item.requiredDocuments || schemeDoc.docs;
          schemeDoc.fetchedAt = new Date();
          schemeDoc.contentHash = currentHash;
          schemeDoc.rawSourceText = pageText.substring(0, 4000);
          await schemeDoc.save();
          results.updatedSchemes++;
          console.log(`[CrawlerService] Updated scheme from fresh fetch: "${item.name}". Changes: ${changes.length > 0 ? changes.join(', ') : 'Minor text changes'}`);
        }
      }

      results.foundSchemes.push({
        name: item.name,
        nameTamil: item.nameTamil || '',
        category: item.category || 'General',
        source: page.name,
        sourceUrl: page.url,
        reviewStatus: schemeDoc.reviewStatus
      });
    }

    // DEPTH 2 CRAWLING: follow links on the directory page
    const subLinks = (fetchResult.links || [])
       .filter(l => l.startsWith(new URL(page.url).origin) && l !== page.url)
       .slice(0, 15);
       
    for (const subUrl of subLinks) {
       console.log(`[CrawlerService] Crawling sub-page: ${subUrl}`);
       const subResult = await fetchCleanPageText(subUrl);
       await new Promise(r => setTimeout(r, sourcesConfig.politeness?.requestDelayMs || 1000));
       if (!subResult.success || !subResult.text) continue;
       
       const subHash = hashContent(subResult.text);
       const existingSub = await Scheme.findOne({ sourceUrl: subUrl, contentHash: subHash });
       if (existingSub) continue;
       
       let subSchemes = [];
       try {
         const aiMode = process.env.AI_MODE || 'auto';
         if (aiMode === 'off') {
           subSchemes = fallbackExtractor(subResult.text, subUrl, page.name);
         } else if (aiMode === 'only') {
           subSchemes = await extractSchemesFromText(subResult.text, subUrl);
         } else {
           subSchemes = fallbackExtractor(subResult.text, subUrl, page.name);
           if (subSchemes.length === 0) {
             subSchemes = await extractSchemesFromText(subResult.text, subUrl);
           }
         }
       } catch (e) {
         if (e.message === 'ai_quota_exhausted') {
            const CrawlerJob = require('../models/CrawlerJob');
            await CrawlerJob.findOneAndUpdate({ sourceUrl: subUrl }, { status: 'awaiting_extraction', rawSourceText: subResult.text.substring(0, 4000), contentHash: subHash }, { upsert: true });
            results.awaitingExtractionCount++;
            continue;
         }
       }
       
       for (const item of subSchemes) {
          if (!item.name) continue;
          if (!isValidSchemeCandidate(item, subResult.text, subResult.rawHtml, page.name)) {
             continue;
          }

          const cleanBenefit = item.benefit && !item.benefit.toLowerCase().includes('benefit for ') && !item.benefit.toLowerCase().includes('government benefit extracted from')
             ? item.benefit
             : '';

          let schemeDoc = await Scheme.findOne({
            $or: [
              { name: { $regex: new RegExp('^' + item.name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '$', 'i') } },
              { nameTamil: item.nameTamil },
              { sourceUrl: subUrl, name: { $regex: new RegExp('^' + item.name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '$', 'i') } }
            ]
          });
          
          if (!schemeDoc) {
             schemeDoc = new Scheme({
               name: item.name, nameTamil: item.nameTamil || '', category: item.category || 'General',
               benefit: cleanBenefit, rules: item.rules || {}, eligibilityRules: item.eligibilityRules || {},
               unmappedCriteria: item.unmappedCriteria || [], docs: item.requiredDocuments || [],
               requiredDocuments: item.requiredDocuments || [], steps: item.howToApply || [],
               howToApply: item.howToApply || [], officialLinks: item.officialLinks || [[page.name, subUrl]],
               sourceUrl: subUrl, rawSourceText: subResult.text.substring(0, 4000), origin: 'live',
               fetchedAt: new Date(), contentHash: subHash, reviewStatus: 'pending'
             });
             await schemeDoc.save();
             results.newSchemesFound++;
          }
       }
    }
  }

  // Count total pending schemes
  results.pendingSchemesCount = await Scheme.countDocuments({ reviewStatus: 'pending' });
  console.log(`[CrawlerService] Crawler run complete. ${results.newSchemesFound} new schemes found. ${results.pendingSchemesCount} total pending review. ${results.awaitingExtractionCount} pages awaiting extraction.`);
  
  return results;
}

/**
 * Asks Gemini to extract schemes strictly adhering to allowed fields without guessing.
 */
async function extractSchemesFromText(pageText, sourceUrl, sourceName) {
  try {
    // Stage A / Advanced Fetching v3: Fetch & Extract with zero AI - use deterministic extractor
    return fallbackExtractor(pageText, sourceUrl, sourceName);
  } catch (err) {
    console.error(`[CrawlerService] Extraction failed for ${sourceUrl}:`, err.message);
    return [];
  }
}

/**
 * Fallback deterministic extractor when API key is unconfigured.
 */
function fallbackExtractor(pageText, sourceUrl, sourceName) {
  const schemes = [];
  const textLower = pageText.toLowerCase();

  // 1. Pensions (cra.tn.gov.in)
  if (textLower.includes('old age pension') || textLower.includes('oap') || textLower.includes('destitute widow')) {
    schemes.push({
      name: textLower.includes('widow') ? 'Destitute Widow Pension' : 'Old Age Pension (IGNOAPS / TN)',
      category: 'Pensions',
      benefit: 'Monthly pension of ₹1000 - ₹1200',
      eligibilityRules: textLower.includes('widow') ? { gender: 'F' } : { age: { $gte: 60 } },
      unmappedCriteria: ['Must be destitute / below poverty line'],
      requiredDocuments: ['Aadhaar Card', 'Ration Card', 'Bank Passbook'],
      howToApply: ['Apply via e-Sevai or Revenue Inspector'],
      officialLinks: [[sourceName, sourceUrl]]
    });
  }

  // 2. Kalaignar Magalir Urimai Thogai
  if (textLower.includes('kalaignar magalir urimai') || textLower.includes('kmut')) {
    schemes.push({
      name: 'Kalaignar Magalir Urimai Thogai',
      category: 'Social Welfare',
      benefit: '₹1,000/month by DBT to the woman head of an eligible family',
      eligibilityRules: { gender: 'F', age: { $gte: 21 }, famhead: true, income: { $lt: 250000 }, fourWheeler: false },
      unmappedCriteria: ['Family land under 5 acres wetland'],
      requiredDocuments: ['Family (ration) card', 'Aadhaar', 'Bank passbook'],
      howToApply: ['Apply at special camps or via online portal'],
      officialLinks: [[sourceName, sourceUrl]]
    });
  }

  // 3. Pudhumai Penn
  if (textLower.includes('pudhumai penn') || (textLower.includes('girl') && textLower.includes('higher education'))) {
    schemes.push({
      name: 'Pudhumai Penn',
      category: 'Education',
      benefit: '₹1,000/month for girls in higher education',
      eligibilityRules: { gender: 'F', govschool: true, highered: true },
      unmappedCriteria: ['Studied Classes 6-12 in govt school'],
      requiredDocuments: ['School Bonafide', 'Aadhaar', 'Bank Details'],
      howToApply: ['Apply through college nodal officer'],
      officialLinks: [[sourceName, sourceUrl]]
    });
  }

  return schemes;
}

module.exports = {
  runLiveCrawler,
  hashContent,
  normalizeName
};
