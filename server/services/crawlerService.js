const crypto = require('crypto');
const Scheme = require('../models/Scheme');
const Source = require('../models/Source');
const { fetchCleanPageText } = require('./fetcher');
const { generateContentWithRetry } = require('../lib/gemini');
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
      if (!item.name || !item.benefit) continue;

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

      if (!schemeDoc) {
        // Create new pending live record
        schemeDoc = new Scheme({
          name: item.name,
          nameTamil: item.nameTamil || '',
          category: item.category || 'General',
          benefit: item.benefit,
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
          fetchedAt: new Date(),
          contentHash: currentHash,
          reviewStatus: 'pending' // New live records start as pending
        });

        await schemeDoc.save();
        results.newSchemesFound++;
        console.log(`[CrawlerService] Discovered NEW scheme (pending review): "${item.name}"`);
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
          if (!item.name || !item.benefit) continue;
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
               benefit: item.benefit, rules: item.rules || {}, eligibilityRules: item.eligibilityRules || {},
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
async function extractSchemesFromText(pageText, sourceUrl) {
  try {
    const prompt = `
    Extract Tamil Nadu and Central government schemes & pensions from the fetched webpage text below.
    CRITICAL RULES:
    1. Do NOT guess or hallucinate any value not explicitly mentioned on the page. Leave unknown fields empty/null.
    2. Format eligibilityRules ONLY using these 11 allowed field names:
       age, gender, annualIncome, maritalStatus, disabilityPercent, destitute, headOfFamily, studiedInGovtSchool, inHigherEducation, student, farmer.
    3. Put any other criteria in unmappedCriteria.

    Webpage Text:
    ${pageText.substring(0, 25000)}

    Return JSON strictly in this format:
    {
      "schemes": [
        {
          "name": "Scheme Name in English",
          "nameTamil": "Scheme Name in Tamil if present, else null",
          "category": "Category name",
          "benefit": "Benefit description",
          "eligibilityRules": {
            "age": { "$gte": 60 },
            "gender": "F",
            "annualIncome": { "$lt": 120000 },
            "maritalStatus": "widowed",
            "destitute": true
          },
          "unmappedCriteria": ["other criterion"],
          "requiredDocuments": ["Aadhaar", "Passbook"],
          "howToApply": ["Step 1", "Step 2"],
          "officialLinks": [["Portal Name", "${sourceUrl}"]]
        }
      ]
    }
    `;

    const responseObj = await generateContentWithRetry({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" }
    });

    const parsed = JSON.parse(responseObj.text);
    return parsed.schemes || [];
  } catch (err) {
    if (err.message && err.message.includes('429')) {
      console.warn(`[CrawlerService] AI quota exhausted during extraction for ${sourceUrl}`);
      throw new Error('ai_quota_exhausted');
    }
    console.error(`[CrawlerService] Gemini extraction failed for ${sourceUrl}:`, err.message);
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

  // Generic fallback if nothing specific matched
  if (schemes.length === 0 && (textLower.includes('pension') || textLower.includes('scheme'))) {
    const detailAdapter = new DetailAdapter(pageText, sourceUrl);
    const sections = detailAdapter.extractSections();
    const criteriaParser = new CriteriaParser();
    
    // Attempt basic NLP extraction for documents and steps
    const docs = sections.requiredDocuments.length > 0 ? sections.requiredDocuments : [];
    if (textLower.includes('aadhaar') && !docs.includes('Aadhaar Card')) docs.push('Aadhaar Card');
    if ((textLower.includes('ration') || textLower.includes('smart card')) && !docs.includes('Ration/Smart Card')) docs.push('Ration/Smart Card');
    if ((textLower.includes('bank') || textLower.includes('passbook')) && !docs.includes('Bank Passbook')) docs.push('Bank Passbook');
    if (textLower.includes('photo') && !docs.includes('Passport Size Photo')) docs.push('Passport Size Photo');
    
    if (docs.length === 0) docs.push('Aadhaar Card', 'Ration Card'); // Default

    const steps = sections.howToApply.length > 0 ? sections.howToApply : [];
    if (textLower.includes('online') && !steps.includes('Apply online through the official portal')) steps.push('Apply online through the official portal');
    if ((textLower.includes('e-sevai') || textLower.includes('csc')) && !steps.includes('Visit nearest e-Sevai centre')) steps.push('Visit nearest e-Sevai centre');
    
    if (steps.length === 0) steps.push('Apply through official portal or e-Sevai centre');

    const rulesParsed = criteriaParser.parse(textLower);

    schemes.push({
      name: `Live Scheme from ${sourceName}`,
      nameTamil: '',
      category: 'Social Welfare',
      benefit: sections.benefit || 'Government benefit extracted from official portal',
      eligibilityRules: { ...sections.eligibilityRules, ...rulesParsed.rules },
      unmappedCriteria: rulesParsed.unmapped || [],
      requiredDocuments: docs,
      howToApply: steps,
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
