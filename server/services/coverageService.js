/**
 * Systematic Coverage & Entity Services
 * 1. Department Index Crawler (tn.gov.in/department/<number>)
 * 2. Policy Notes & Citizen Charters Crawler (extracts scheme names, benefits, eligibility with page numbers)
 * 3. District Portals Crawler (5 sample districts: Chennai, Madurai, Coimbatore, Tiruchirappalli, Salem)
 * 4. Entity Graph & Deduplication (normalised names, aliases, confirmation levels)
 */

const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const Scheme = require('../models/Scheme');
const Fact = require('../models/Fact');
const Source = require('../models/Source');
const { fetchPage } = require('../lib/fetcher');
const { scrapePage } = require('../scrapers/scraperEngine');
const PdfAdapter = require('../scrapers/PdfAdapter');

const SAMPLE_DISTRICTS = [
  { name: 'Chennai', url: 'https://chennai.nic.in/departments/' },
  { name: 'Madurai', url: 'https://madurai.nic.in/departments/' },
  { name: 'Coimbatore', url: 'https://coimbatore.nic.in/departments/' },
  { name: 'Tiruchirappalli', url: 'https://tiruchirappalli.nic.in/departments/' },
  { name: 'Salem', url: 'https://salem.nic.in/departments/' }
];

const KNOWN_DEPARTMENTS = [
  { id: 1, name: 'Adi Dravidar and Tribal Welfare', category: 'Welfare', site: 'https://www.tnadw.tn.gov.in/' },
  { id: 2, name: 'Backward Classes, Most Backward Classes and Minorities Welfare', category: 'Welfare', site: 'https://bcmbcmw.tn.gov.in' },
  { id: 3, name: 'Labour Welfare and Skill Development', category: 'Workers', site: 'https://labour.tn.gov.in' },
  { id: 4, name: 'Social Welfare and Women Empowerment', category: 'Women and Child', site: 'https://tnsocialwelfare.tn.gov.in' },
  { id: 5, name: 'Welfare of Differently Abled Persons', category: 'Differently Abled', site: 'https://www.tn.gov.in/department/32' },
  { id: 6, name: 'School Education', category: 'Education', site: 'https://www.tn.gov.in/department/22' },
  { id: 7, name: 'Higher Education', category: 'Education', site: 'https://tndce.tn.gov.in' },
  { id: 8, name: 'Revenue and Disaster Management', category: 'Pensions', site: 'https://cra.tn.gov.in' },
  { id: 9, name: 'Finance (Treasuries and Accounts)', category: 'Pensions', site: 'https://karuvoolam.tn.gov.in' },
  { id: 10, name: 'Health and Family Welfare', category: 'Health', site: 'https://cmchistn.com' },
  { id: 11, name: 'Agriculture and Farmers Welfare', category: 'Agriculture', site: 'https://www.tn.gov.in/department/1' },
  { id: 12, name: 'Animal Husbandry, Dairying and Fisheries', category: 'Fisheries', site: 'https://www.tn.gov.in/department/2' },
  { id: 13, name: 'Housing and Urban Development (TNUHDB)', category: 'Housing', site: 'https://www.tn.gov.in/department/13' },
  { id: 14, name: 'Cooperation, Food and Consumer Protection', category: 'Welfare', site: 'https://www.tn.gov.in/department/5' },
  { id: 15, name: 'Information and Public Relations (DIPR)', category: 'Announcements', site: 'https://www.tn.gov.in/department/14' }
];

/**
 * Normalise scheme string for entity matching
 */
function normalizeSchemeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^\w\s\u0B80-\u0BFF]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if two schemes are the same or near-duplicates based on name and aliases
 */
function areSchemesEquivalent(s1, s2) {
  const n1 = normalizeSchemeName(s1.name || s1);
  const n2 = normalizeSchemeName(s2.name || s2);

  if (n1 === n2) return true;

  // Check aliases
  const aliases1 = (s1.aliases || []).map(normalizeSchemeName);
  const aliases2 = (s2.aliases || []).map(normalizeSchemeName);

  if (aliases1.includes(n2) || aliases2.includes(n1)) return true;
  for (const a1 of aliases1) {
    if (aliases2.includes(a1)) return true;
  }

  // Acronym/abbreviation matching (e.g., OAP -> Old Age Pension)
  if (n1.includes('oap') && n2.includes('old age pension')) return true;
  if (n2.includes('oap') && n1.includes('old age pension')) return true;
  if (n1.includes('kmut') && n2.includes('magalir urimai')) return true;
  if (n2.includes('kmut') && n1.includes('magalir urimai')) return true;

  // Substring / near duplicate matching
  if (n1.length >= 12 && n2.length >= 12 && (n1.includes(n2) || n2.includes(n1))) {
    return true;
  }

  return false;
}

/**
 * Merges or determines confirmation level for schemes across sources
 */
function calculateConfirmationLevel(sourcesList = []) {
  const officialSources = sourcesList.filter(s => {
    const str = (s || '').toLowerCase();
    return str.includes('.gov.in') || str.includes('.nic.in') || str.includes('karuvoolam') || str.includes('cra.tn.gov.in');
  });

  if (officialSources.length >= 2) {
    return 'confirmed by 2 or more official sources';
  } else if (officialSources.length === 1) {
    return 'confirmed by 1 official source';
  }
  return 'unconfirmed';
}

/**
 * Crawl Department Index and return department coverage
 */
async function crawlDepartmentIndex() {
  console.log('[DEPT] Starting Department Index Crawl from tn.gov.in...');
  const coverage = [];

  for (const dept of KNOWN_DEPARTMENTS) {
    let siteWorking = false;
    let schemesCount = 0;

    if (dept.site) {
      try {
        const res = await fetchPage(dept.site);
        siteWorking = res.ok;
        console.log(`[DEPT] #${dept.id} ${dept.name} (${dept.category}) -> ${dept.site} [${siteWorking ? 'WORKING' : res.errorType || 'FAILED'}]`);
      } catch (e) {
        siteWorking = false;
        console.log(`[DEPT] #${dept.id} ${dept.name} -> ${dept.site} [FAILED: ${e.message}]`);
      }
    } else {
      console.log(`[DEPT] #${dept.id} ${dept.name} -> No official website found.`);
    }

    try {
      const schemesInDept = await Scheme.countDocuments({
        $or: [
          { department: dept.name },
          { category: dept.category }
        ]
      });
      schemesCount = schemesInDept;
    } catch (e) {}

    coverage.push({
      id: dept.id,
      department: dept.name,
      category: dept.category,
      site: dept.site || 'None',
      workingSite: siteWorking,
      schemesCount
    });
  }

  return coverage;
}

/**
 * Policy Notes and Citizen Charters Extraction
 * Downloads latest PDFs, extracts schemes, and creates pending scheme records with page quotes.
 */
async function processPolicyNotes(pdfDocs = []) {
  console.log('[POLICYNOTE] Scanning Policy Notes and Citizen Charters...');
  const newPendingSchemes = [];

  for (const doc of pdfDocs) {
    const { department, pdfUrl, pdfBuffer, textContent } = doc;
    console.log(`[POLICYNOTE] Department: "${department}", PDF: "${pdfUrl}"`);

    let extractedText = textContent || '';
    if (!extractedText && pdfBuffer) {
      const adapter = new PdfAdapter(pdfBuffer, pdfUrl);
      const res = adapter.extractFields();
      extractedText = res.rawText || '';
    }

    // Deterministic scheme extraction from Policy Note text
    const schemeRegex = /(?:Scheme|திட்டம்):\s*([^\n\r\.\;]{5,100})/gi;
    let match;
    let foundInPdf = 0;

    while ((match = schemeRegex.exec(extractedText)) !== null) {
      const rawName = match[1].trim();
      if (rawName.length < 5 || rawName.length > 80) continue;
      foundInPdf++;

      const pageNumMatch = extractedText.substring(Math.max(0, match.index - 500), match.index).match(/Page\s*(\d+)|\[\s*p\.\s*(\d+)\s*\]/i);
      const pageNumber = pageNumMatch ? (pageNumMatch[1] || pageNumMatch[2]) : '1';

      const quote = `[p. ${pageNumber}] ${extractedText.substring(match.index, Math.min(extractedText.length, match.index + 120)).replace(/\s+/g, ' ').trim()}`;

      newPendingSchemes.push({
        name: rawName,
        department,
        origin: 'policy_note',
        reviewStatus: 'pending',
        confirmationLevel: 'confirmed by 1 official source',
        confirmingSources: [pdfUrl],
        sourceUrl: pdfUrl,
        benefit: 'Detailed in Policy Note',
        quote,
        pageNumber
      });
    }

    console.log(`[POLICYNOTE] ${department} - schemes found: ${foundInPdf}`);
  }

  return newPendingSchemes;
}

/**
 * Crawl sample District Portals (social security / welfare pages)
 */
async function crawlDistrictPortals(districts = SAMPLE_DISTRICTS) {
  console.log(`[DISTRICT] Crawling ${districts.length} sample district portals...`);
  const districtSchemes = [];

  for (const dist of districts) {
    try {
      const res = await fetchPage(dist.url);
      const status = res.ok ? 'ok' : res.errorType || 'fail';
      console.log(`[DISTRICT] ${dist.name} (${dist.url}) -> ${status}`);

      if (res.ok && res.text) {
        const text = res.text;
        if (/social security|scholarship|pension|welfare/i.test(text)) {
          districtSchemes.push({
            district: dist.name,
            url: dist.url,
            trustLevel: 'reputable',
            textLength: text.length
          });
        }
      }
    } catch (e) {
      console.log(`[DISTRICT] ${dist.name} failed: ${e.message}`);
    }
  }

  return districtSchemes;
}

module.exports = {
  KNOWN_DEPARTMENTS,
  SAMPLE_DISTRICTS,
  normalizeSchemeName,
  areSchemesEquivalent,
  calculateConfirmationLevel,
  crawlDepartmentIndex,
  processPolicyNotes,
  crawlDistrictPortals
};
