const crypto = require('crypto');
const Scheme = require('../models/Scheme');
const Fact = require('../models/Fact');
const DisplayCache = require('../models/DisplayCache');
const DisplayMetrics = require('../models/DisplayMetrics');

const DISPLAY_AI_MAX_CALLS_PER_DAY = parseInt(process.env.DISPLAY_AI_MAX_CALLS_PER_DAY || '50', 10);
const PROMPT_VERSION = 'v1';

// In-memory monitoring metrics if DB is disconnected
const inMemoryMetrics = {
  algoSummaries: 0,
  aiSummaries: 0,
  cacheHits: 0,
  cacheMisses: 0,
  rejections: 0,
  rejectionReasons: [],
  displayAiCallsToday: 0
};

function formatTime(d = new Date()) {
  return d.toTimeString().split(' ')[0];
}

function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

async function recordDisplayMetric(metricName, extra = null) {
  if (inMemoryMetrics[metricName] !== undefined) {
    inMemoryMetrics[metricName]++;
  }
  if (metricName === 'rejections' && extra) {
    inMemoryMetrics.rejectionReasons.push(extra);
    if (inMemoryMetrics.rejectionReasons.length > 50) {
      inMemoryMetrics.rejectionReasons.shift();
    }
  }

  const mongoose = require('mongoose');
  if (mongoose.connection.readyState === 1) {
    try {
      const today = getTodayString();
      const update = { $inc: { [metricName]: 1 } };
      if (metricName === 'rejections' && extra) {
        update.$push = { rejectionReasons: extra };
      }
      await DisplayMetrics.findOneAndUpdate({ date: today }, update, { upsert: true });
    } catch (e) {}
  }
}

async function getDisplayAiCallsToday() {
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState === 1) {
    try {
      const today = getTodayString();
      const rec = await DisplayMetrics.findOne({ date: today }).lean();
      return rec ? (rec.displayAiCallsToday || 0) : inMemoryMetrics.displayAiCallsToday;
    } catch (e) {}
  }
  return inMemoryMetrics.displayAiCallsToday;
}

// =========================================================================
// B1. ALGORITHMIC PRESENTER (DEFAULT, ZERO AI)
// =========================================================================

/**
 * Format Indian numbers (e.g. ₹1,00,000, 25 lakh, 1 crore)
 */
function formatIndianNumber(num, isTamil = false) {
  if (num === null || num === undefined) return '';
  const n = typeof num === 'string' ? parseInt(num.replace(/,/g, ''), 10) : num;
  if (isNaN(n)) return String(num);

  if (n >= 10000000) {
    const crores = n / 10000000;
    const formatted = crores % 1 === 0 ? crores : crores.toFixed(1);
    return isTamil ? `₹${formatted} கோடி` : `₹${formatted} crore`;
  }
  if (n >= 100000) {
    const lakhs = n / 100000;
    const formatted = lakhs % 1 === 0 ? lakhs : lakhs.toFixed(1);
    return isTamil ? `₹${formatted} லட்சம்` : `₹${formatted} lakh`;
  }

  // Standard Indian comma grouping (1,00,000)
  return '₹' + n.toLocaleString('en-IN');
}

/**
 * Deterministic benefit line
 */
function renderBenefitLine({ amount, frequency, mode, benefitText, isTamil = false }) {
  if (amount) {
    const formattedAmt = formatIndianNumber(amount, isTamil);
    const freqStr = frequency === 'monthly'
      ? (isTamil ? 'மாதந்தோறும்' : 'per month')
      : (frequency === 'annual' ? (isTamil ? 'ஆண்டுதோறும்' : 'per year') : (isTamil ? 'ஒரு முறை' : 'one-time'));
    const modeStr = mode === 'dbt' || mode === 'bank'
      ? (isTamil ? ', உங்கள் வங்கிக் கணக்கில் நேரடியாக செலுத்தப்படும்' : ', paid to your bank account')
      : '';
    return `${formattedAmt} ${freqStr}${modeStr}`;
  }

  if (benefitText) {
    return benefitText;
  }

  return isTamil ? 'அரசு நலத்திட்ட உதவி' : 'Government welfare assistance';
}

/**
 * Eligibility bullets mapping
 */
function renderEligibilityBullets({ rules = {}, facts = [], unmapped = [], isTamil = false }) {
  const bullets = [];
  const findQuote = (field) => {
    const f = facts.find(fact => fact.field === field && fact.quote);
    return f ? f.quote : null;
  };

  // 1. Age
  if (rules.age) {
    let label = '';
    if (typeof rules.age === 'object') {
      if (rules.age.$gte) {
        label = isTamil ? `${rules.age.$gte} வயது அல்லது அதற்கு மேல்` : `Age ${rules.age.$gte} or above`;
      } else if (rules.age.$lte) {
        label = isTamil ? `${rules.age.$lte} வயதுக்கு உட்பட்டவர்` : `Age ${rules.age.$lte} or below`;
      }
    } else {
      label = isTamil ? `வயது ${rules.age}` : `Age ${rules.age}`;
    }
    bullets.push({
      type: 'age',
      text: label,
      quote: findQuote('age') || findQuote('ageMin')
    });
  }

  // 2. Annual Income
  const incomeRule = rules.income || rules.annualIncome;
  if (incomeRule) {
    let limit = 0;
    if (typeof incomeRule === 'object' && (incomeRule.$lt || incomeRule.$lte)) {
      limit = incomeRule.$lt || incomeRule.$lte;
    } else if (typeof incomeRule === 'number') {
      limit = incomeRule;
    }
    if (limit > 0) {
      const formatted = formatIndianNumber(limit, isTamil);
      bullets.push({
        type: 'income',
        text: isTamil ? `குடும்ப ஆண்டு வருமானம் ${formatted}-க்கு மிகாமல் இருக்க வேண்டும்` : `Family income below ${formatted} a year`,
        quote: findQuote('incomeLimit') || findQuote('annualIncome')
      });
    }
  }

  // 3. Gender
  if (rules.gender) {
    if (rules.gender === 'F') {
      bullets.push({
        type: 'gender',
        text: isTamil ? 'பெண்கள் மட்டும்' : 'Women only',
        quote: findQuote('gender')
      });
    } else if (rules.gender === 'M') {
      bullets.push({
        type: 'gender',
        text: isTamil ? 'ஆண்கள் மட்டும்' : 'Men only',
        quote: findQuote('gender')
      });
    }
  }

  // 4. Marital Status
  if (rules.marital || rules.maritalStatus) {
    const m = rules.marital || rules.maritalStatus;
    if (m === 'widowed') {
      bullets.push({
        type: 'maritalStatus',
        text: isTamil ? 'விதவை அல்லது ஆதரவற்ற விதவை' : 'Destitute widow',
        quote: findQuote('maritalStatus')
      });
    } else if (m === 'deserted') {
      bullets.push({
        type: 'maritalStatus',
        text: isTamil ? 'கணவரால் கைவிடப்பட்ட பெண்' : 'Deserted / divorced women',
        quote: findQuote('maritalStatus')
      });
    } else if (m === 'single' || m === 'unmarried') {
      bullets.push({
        type: 'maritalStatus',
        text: isTamil ? 'திருமணமாகாத பெண்' : 'Unmarried destitute woman',
        quote: findQuote('maritalStatus')
      });
    }
  }

  // 5. Destitute
  if (rules.destitute) {
    bullets.push({
      type: 'destitute',
      text: isTamil ? 'ஆதரவற்ற நபர்' : 'Destitute person (no regular family income)',
      quote: findQuote('destitute')
    });
  }

  // 6. Disability
  const dis = rules.disability || rules.disabilityPercent;
  if (dis) {
    const pct = typeof dis === 'object' ? (dis.$gte || 40) : dis;
    bullets.push({
      type: 'disability',
      text: isTamil ? `${pct}% அல்லது அதற்கு மேற்பட்ட மாற்றுத்திறன்` : `${pct}% or above disability`,
      quote: findQuote('disabilityPercent') || findQuote('disability')
    });
  }

  // 7. Student / Govt School / Higher Ed
  if (rules.govschool || rules.studiedInGovtSchool) {
    bullets.push({
      type: 'student',
      text: isTamil ? 'அரசுப் பள்ளியில் 6 முதல் 12-ஆம் வகுப்பு வரை படித்தவர்' : 'Studied in a government school from Classes 6 to 12',
      quote: findQuote('govschool')
    });
  }
  if (rules.highered || rules.inHigherEducation) {
    bullets.push({
      type: 'student',
      text: isTamil ? 'கல்லூரி / உயர் கல்வியில் பயிலும் மாணவர்' : 'Enrolled in recognized higher education / college course',
      quote: findQuote('highered')
    });
  }

  // 8. Community Category
  if (rules.communityCategory) {
    const c = rules.communityCategory;
    const tamilLabels = {
      SC: 'ஆதி திராவிடர் (SC)',
      ST: 'பழங்குடியினர் (ST)',
      MBC: 'மிகவும் பிற்படுத்தப்பட்ட வகுப்பினர் (MBC)',
      BC: 'பிற்படுத்தப்பட்ட வகுப்பினர் (BC)',
      Minority: 'சிறுபான்மையினர்'
    };
    bullets.push({
      type: 'community',
      text: isTamil ? (tamilLabels[c] || c) : `Belongs to ${c} community`,
      quote: findQuote('communityCategory')
    });
  }

  // 9. Worker Type
  if (rules.workerType) {
    const w = rules.workerType;
    const workerLabels = {
      construction: isTamil ? 'பதிவு செய்த கட்டுமானத் தொழிலாளர்' : 'Registered Construction Worker',
      auto_driver: isTamil ? 'ஆட்டோ / மோட்டார் வாகன ஓட்டுநர்' : 'Auto / Motor Transport Driver',
      domestic_worker: isTamil ? 'வீட்டுப் பணியாளர்' : 'Domestic Worker',
      vendor: isTamil ? 'தெருவோர வியாபாரி' : 'Street Vendor',
      farmer: isTamil ? 'விவசாயி / விவசாயத் தொழிலாளி' : 'Farmer / Agricultural Worker',
      fisherman: isTamil ? 'மீனவர்' : 'Fisherman / Fisherfolk',
      weaver: isTamil ? 'கைத்தறி நெசவாளர்' : 'Handloom Weaver',
      manual_worker: isTamil ? 'உடலுழைப்புத் தொழிலாளர்' : 'Manual / Unorganised Worker'
    };
    bullets.push({
      type: 'worker',
      text: workerLabels[w] || (isTamil ? `தொழிலாளர்: ${w}` : `Worker type: ${w}`),
      quote: findQuote('workerType')
    });
  }

  // 10. Age Range (e.g. 18 to 60 for worker boards)
  if (rules.ageRange) {
    const min = rules.ageRange.min || 18;
    const max = rules.ageRange.max || 60;
    bullets.push({
      type: 'ageRange',
      text: isTamil ? `${min} முதல் ${max} வயது வரை` : `Age between ${min} and ${max} years`,
      quote: findQuote('ageRange')
    });
  }

  // 11. Course Level
  if (rules.courseLevel) {
    const cl = rules.courseLevel;
    bullets.push({
      type: 'courseLevel',
      text: isTamil ? `படிப்பு நிலை: ${cl}` : `Course level: ${cl}`,
      quote: findQuote('courseLevel')
    });
  }

  // 12. Unmapped "Also check" conditions
  const alsoCheck = (unmapped || []).map(u => ({
    type: 'unmapped',
    text: u,
    quote: null
  }));

  return { bullets, alsoCheck };
}

/**
 * Documents and Steps cleaning
 */
function cleanDocumentsAndSteps(docs = [], steps = []) {
  const cleanDocs = Array.from(new Set(
    (docs || [])
      .map(d => (d || '').trim())
      .filter(d => d.length > 0)
  ));

  const cleanSteps = (steps || [])
    .map(s => (s || '').trim())
    .filter(s => s.length > 0)
    .map((s, idx) => {
      // Shorten long lines at sentence boundaries without changing words
      if (s.length > 250) {
        const firstSentence = s.split(/(?<=[.?!])\s+/)[0];
        return `${firstSentence}`;
      }
      return s;
    });

  return {
    documents: cleanDocs,
    steps: cleanSteps
  };
}

/**
 * Extractive summarization:
 * Scores sentences of official text based on position, keywords (eligibility, benefit, amount),
 * numbers, and title similarity. Picks the top 2-4 sentences in original order.
 */
function extractiveSummarize(text, title = '', isTamil = false) {
  if (!text || text.trim().length === 0) {
    return {
      summary: isTamil ? 'அதிகாரப்பூர்வ தகவல்களிலிருந்து பெறப்பட்ட சுருக்கம்.' : 'Official welfare scheme information from Tamil Nadu government.',
      label: isTamil ? 'அதிகாரப்பூர்வ உரையிலிருந்து பெறப்பட்ட சுருக்கம்' : 'Summary from the official text'
    };
  }

  const rawSentences = text
    .replace(/Rs\./gi, 'Rs__DOT__')
    .replace(/G\.O\./gi, 'GO__DOT__')
    .replace(/[\r\n]+/g, ' ')
    .split(/(?<=[.?!])\s+/)
    .map(s => s.replace(/Rs__DOT__/g, 'Rs.').replace(/GO__DOT__/g, 'G.O.').trim())
    .filter(s => s.length >= 25 && s.length <= 350);

  if (rawSentences.length <= 3) {
    return {
      summary: rawSentences.join(' '),
      label: isTamil ? 'அதிகாரப்பூர்வ உரையிலிருந்து பெறப்பட்ட சுருக்கம்' : 'Summary from the official text'
    };
  }

  const keywords = ['eligibility', 'benefit', 'pension', 'assistance', 'rs.', '₹', 'month', 'age', 'annual', 'application', 'scheme', 'women', 'தகுதி', 'உதவி', 'ஓய்வூதியம்'];
  const titleWords = (title || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);

  const scored = rawSentences.map((sentence, idx) => {
    let score = 0;
    const lower = sentence.toLowerCase();

    // Position score (earlier sentences matter more)
    score += Math.max(0, 10 - idx);

    // Keyword score
    keywords.forEach(kw => {
      if (lower.includes(kw)) score += 3;
    });

    // Number score
    if (/\d+/.test(sentence)) score += 4;

    // Title similarity
    titleWords.forEach(tw => {
      if (lower.includes(tw)) score += 5;
    });

    return { sentence, idx, score };
  });

  // Pick top 3 sentences, sort by original index
  const topSentences = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .sort((a, b) => a.idx - b.idx)
    .map(item => item.sentence);

  return {
    summary: topSentences.join(' '),
    label: isTamil ? 'அதிகாரப்பூர்வ உரையிலிருந்து பெறப்பட்ட சுருக்கம்' : 'Summary from the official text'
  };
}

/**
 * Format change messages
 */
function formatChangeMessage(changeHistoryEntry, schemeName = '') {
  if (!changeHistoryEntry) return '';
  let domain = 'official portal';
  try {
    if (changeHistoryEntry.source && changeHistoryEntry.source.startsWith('http')) {
      domain = new URL(changeHistoryEntry.source).hostname;
    }
  } catch (e) {}
  const dateStr = changeHistoryEntry.date ? new Date(changeHistoryEntry.date).toLocaleDateString('en-IN') : 'recently';

  if (changeHistoryEntry.field === 'applicationStatus') {
    const quotePart = changeHistoryEntry.quote ? ` ("${changeHistoryEntry.quote}")` : '';
    return `${schemeName}: application status changed from ${changeHistoryEntry.oldValue || 'unknown'} to ${changeHistoryEntry.newValue}${quotePart} (source: ${domain}, ${dateStr})`;
  }

  if (changeHistoryEntry.field === 'benefit') {
    return `${schemeName}: cover/benefit changed from ${changeHistoryEntry.oldValue || 'previous'} to ${changeHistoryEntry.newValue} (source: ${domain}, ${dateStr})`;
  }
  return `${schemeName}: ${changeHistoryEntry.field} updated from ${changeHistoryEntry.oldValue || 'previous'} to ${changeHistoryEntry.newValue} (source: ${domain}, ${dateStr})`;
}

/**
 * Ordering and grouping score for dashboard
 */
function calculateSchemeRankingScore(scheme, profileVerdict = null) {
  let score = 0;
  const why = [];

  // 1. Verdict
  if (profileVerdict === 'eligible') {
    score += 1000;
    why.push('Eligible for citizen profile (+1000)');
  } else if (profileVerdict === 'possibly_eligible') {
    score += 500;
    why.push('Possibly eligible / near miss (+500)');
  }

  // 2. Deadline soon (if deadline exists)
  if (scheme.deadline) {
    const daysLeft = Math.ceil((new Date(scheme.deadline) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysLeft >= 0 && daysLeft <= 15) {
      score += 300;
      why.push(`Deadline approaching in ${daysLeft} days (+300)`);
    }
  }

  // 3. Benefit size
  const amtMatch = (scheme.benefit || '').match(/(?:₹|Rs\.?)\s*([\d,]+)/);
  if (amtMatch) {
    const amt = parseInt(amtMatch[1].replace(/,/g, ''), 10);
    const amtScore = Math.min(200, Math.floor(amt / 100));
    score += amtScore;
    why.push(`Benefit value ₹${amt} (+${amtScore})`);
  }

  // 4. Recently changed
  if (scheme.changedRecently) {
    score += 150;
    why.push('Recently verified updates (+150)');
  }

  // 5. Verification level
  if (scheme.verificationLevel === 'official' || scheme.verificationStatus === 'verified' || scheme.verificationStatus === 'confirmed') {
    score += 100;
    why.push('Officially confirmed source (+100)');
  }

  return { score, why };
}

// =========================================================================
// B2. AI PRESENTER (OPTIONAL, EXPLAIN ONLY WITH VALIDATION & FALLBACK)
// =========================================================================

/**
 * Deterministic hash of facts array for cache keying
 */
function calculateFactsContentHash(facts = []) {
  const normalized = facts.map(f => ({
    id: String(f._id || f.id || `${f.field}:${f.value}`),
    field: f.field,
    value: f.value,
    quote: f.quote
  })).sort((a, b) => a.id.localeCompare(b.id));

  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex').substring(0, 16);
}

/**
 * Mandatory Validator:
 * Rejects AI text if:
 * 1. Any number/amount/percentage/date/url not present in cited facts.
 * 2. Cited id does not exist.
 * 3. Contains guarantee/approval ("you will get", "guaranteed").
 * 4. Missing required department disclaimer.
 */
function validateAiPresenterResponse(aiResponse, citedFactsMap) {
  if (!aiResponse || typeof aiResponse !== 'object') {
    return { valid: false, reason: 'Invalid JSON response from AI' };
  }

  const disclaimer = aiResponse.disclaimer || '';
  if (!disclaimer.toLowerCase().includes('confirm with the department')) {
    return { valid: false, reason: 'Missing mandatory disclaimer ("Confirm with the department")' };
  }

  const sentences = aiResponse.sentences || [];
  if (!Array.isArray(sentences) || sentences.length === 0) {
    return { valid: false, reason: 'No explanation sentences returned' };
  }

  // Collect all numbers, dates, urls in facts
  const allowedNumbers = new Set();
  const allowedStrings = new Set();

  for (const fact of Object.values(citedFactsMap)) {
    const valStr = JSON.stringify(fact.value);
    const quoteStr = fact.quote || '';
    const combined = `${valStr} ${quoteStr}`.toLowerCase();

    // Numbers
    const numMatches = combined.match(/\b\d+(?:,\d+)*(?:\.\d+)?\b/g) || [];
    numMatches.forEach(n => allowedNumbers.add(n.replace(/,/g, '')));

    // Lakh / crore
    if (combined.includes('lakh')) allowedStrings.add('lakh');
    if (combined.includes('crore')) allowedStrings.add('crore');
    if (combined.includes('லட்சம்')) allowedStrings.add('லட்சம்');
    if (combined.includes('கோடி')) allowedStrings.add('கோடி');
  }

  const forbiddenPhrases = [
    'you will get', 'you are guaranteed', 'approved automatically',
    'உங்களுக்கு நிச்சயம் கிடைக்கும்', 'உறுதியாக வழங்கப்படும்'
  ];

  for (const item of sentences) {
    const text = item.text || '';
    const textLower = text.toLowerCase();
    const factIds = item.factIds || [];

    // 1. Check forbidden approval claims
    for (const phrase of forbiddenPhrases) {
      if (textLower.includes(phrase)) {
        return { valid: false, reason: `Forbidden approval claim: "${phrase}"` };
      }
    }

    // 2. Validate cited fact IDs
    for (const fid of factIds) {
      if (!citedFactsMap[fid]) {
        return { valid: false, reason: `Invented or non-existent fact id cited: "${fid}"` };
      }
    }

    // 3. Extract numbers from sentence and verify existence in facts
    const sentenceNumbers = textLower.match(/\b\d+(?:,\d+)*(?:\.\d+)?\b/g) || [];
    for (const sNum of sentenceNumbers) {
      const cleanNum = sNum.replace(/,/g, '');
      // Allow benign small ordinals like 1st, 2nd, or sentence numbers 1, 2, 3 if in facts
      if (!allowedNumbers.has(cleanNum)) {
        return { valid: false, reason: `Number ${cleanNum} not present in cited facts` };
      }
    }

    // Check URLs
    const urlMatches = text.match(/https?:\/\/[^\s]+/g) || [];
    for (const url of urlMatches) {
      const isKnownUrl = Object.values(citedFactsMap).some(f => (f.quote || '').includes(url) || (f.sourceUrl || '').includes(url));
      if (!isKnownUrl) {
        return { valid: false, reason: `Unknown URL found in sentence: ${url}` };
      }
    }
  }

  return { valid: true };
}

/**
 * Pure extractive algorithmic explanation (Zero AI in display)
 */
async function generateAiExplanation({ scheme, facts = [], lang = 'en', level = 'simple' }) {
  const isTamil = lang === 'ta';
  const schemeName = scheme.name;
  const algo = extractiveSummarize(scheme.rawSourceText || scheme.benefit || '', schemeName, isTamil);
  return {
    text: algo.summary,
    disclaimer: isTamil ? 'அதிகாரப்பூர்வ உரையிலிருந்து பெறப்பட்ட சுருக்கம்.' : 'Summary from the official text.',
    explainedBy: 'algorithm',
    sentences: [{ text: algo.summary, factIds: [] }]
  };
}

// =========================================================================
// MASTER PRESENTER INTERFACE
// =========================================================================

/**
 * Builds the complete presentation object for a scheme.
 * Returns: { benefit, bullets, conditions, documents, steps, chips, summary, explainedBy, cached, factsVersion, sources }
 */
async function presentScheme({ scheme, facts: passedFacts = null, lang = 'en', level = 'simple', mode = null }) {
  const isTamil = lang === 'ta';
  const schemeName = isTamil && scheme.nameTamil ? scheme.nameTamil : scheme.name;
  const displayMode = (mode || process.env.DISPLAY_MODE || 'auto').toLowerCase();

  // Load Facts from Ledger or synthesize from scheme record
  let facts = Array.isArray(passedFacts) ? [...passedFacts] : [];
  const mongoose = require('mongoose');
  if (facts.length === 0 && mongoose.connection.readyState === 1 && scheme._id) {
    try {
      facts = await Fact.find({ schemeId: scheme._id }).lean();
    } catch (e) {}
  }

  // If no facts in DB yet, synthesize facts from stored scheme properties
  if (facts.length === 0) {
    if (scheme.benefit) {
      const lakhMatch = scheme.benefit.match(/(?:₹|Rs\.?)\s*([\d.]+)\s*(?:lakh|லட்சம்)/i);
      const croreMatch = scheme.benefit.match(/(?:₹|Rs\.?)\s*([\d.]+)\s*(?:crore|கோடி)/i);
      const amtMatch = scheme.benefit.match(/(?:₹|Rs\.?)\s*([\d,]+)/i);

      let amtValue = null;
      let isLakhCover = false;
      if (croreMatch) {
        amtValue = Math.round(parseFloat(croreMatch[1]) * 10000000);
        isLakhCover = true;
      } else if (lakhMatch) {
        amtValue = Math.round(parseFloat(lakhMatch[1]) * 100000);
        isLakhCover = true;
      } else if (amtMatch) {
        amtValue = parseInt(amtMatch[1].replace(/,/g, ''), 10);
      }

      if (amtValue) {
        facts.push({
          _id: 'fact_benefit',
          field: 'amount',
          value: amtValue,
          isLakhCover,
          quote: scheme.benefit,
          extractedBy: 'synthetic'
        });
      }
    }
    const rules = scheme.eligibilityRules || scheme.rules || {};
    if (rules.age) {
      const a = typeof rules.age === 'object' ? (rules.age.$gte || rules.age.$lte || 60) : rules.age;
      facts.push({
        _id: 'fact_age',
        field: 'age',
        value: a,
        quote: `Age ${a} or above`,
        extractedBy: 'synthetic'
      });
    }
    if (rules.income || rules.annualIncome) {
      const inc = rules.income || rules.annualIncome;
      const incVal = typeof inc === 'object' ? (inc.$lt || inc.$lte || 100000) : inc;
      facts.push({
        _id: 'fact_income',
        field: 'incomeLimit',
        value: incVal,
        quote: `Annual income limit ${incVal}`,
        extractedBy: 'synthetic'
      });
    }
    if (rules.gender) {
      facts.push({
        _id: 'fact_gender',
        field: 'gender',
        value: rules.gender,
        quote: rules.gender === 'F' ? 'Women only' : 'Men only',
        extractedBy: 'synthetic'
      });
    }
  }

  // 1. Build Algorithmic Parts (Deterministic baseline)
  const amountFact = facts.find(f => f.field === 'amount');
  const amountVal = amountFact ? amountFact.value : null;

  const isAnnualOrCover = Boolean(amountFact?.isLakhCover || /year|annual|family|cover|காப்பீடு/i.test(scheme.benefit || ''));
  const isMonthly = /month|மாதம்|\/pm/i.test(scheme.benefit || '') && !isAnnualOrCover;

  const benefit = renderBenefitLine({
    amount: amountFact?.isLakhCover ? null : amountVal,
    frequency: isMonthly ? 'monthly' : (isAnnualOrCover ? 'annual' : 'unspecified'),
    mode: isMonthly ? 'dbt' : null,
    benefitText: scheme.benefit,
    isTamil
  });

  const { bullets, alsoCheck } = renderEligibilityBullets({
    rules: scheme.eligibilityRules || scheme.rules || {},
    facts,
    unmapped: scheme.unmappedCriteria || scheme.also || [],
    isTamil
  });

  const { documents, steps } = cleanDocumentsAndSteps(
    scheme.requiredDocuments || scheme.docs || [],
    scheme.howToApply || scheme.steps || []
  );

  // Extractive summary
  const algoSummaryObj = extractiveSummarize(scheme.rawSourceText || scheme.benefit || '', schemeName, isTamil);

  // Key facts chips
  const chips = [
    { label: isTamil ? 'பயன்' : 'Benefit', value: benefit },
    { label: isTamil ? 'நிலை' : 'Status', value: scheme.status || 'ACTIVE' },
    { label: isTamil ? 'சரிபார்ப்பு' : 'Verified', value: scheme.verificationLevel || 'official' },
    { label: isTamil ? 'ஆதாரங்கள்' : 'Sources', value: (scheme.officialLinks || scheme.links || []).length || 1 }
  ];

  if (scheme.deadline) {
    const days = Math.ceil((new Date(scheme.deadline) - new Date()) / (1000 * 60 * 60 * 24));
    chips.push({
      label: isTamil ? 'கடைசி தேதி' : 'Deadline',
      value: days > 0 ? `${days} ${isTamil ? 'நாட்கள் உள்ளன' : 'days left'}` : (isTamil ? 'முடிந்தது' : 'Closed')
    });
  }

  const contentHash = calculateFactsContentHash(facts);
  const cacheKey = `${scheme._id || scheme.name}_${contentHash}_${lang}_${level}_${PROMPT_VERSION}`;

  // 2. Decide Presentation Engine
  let summaryText = algoSummaryObj.summary;
  let explainedBy = 'algorithm';
  let isCached = false;
  let label = algoSummaryObj.label;

  const aiAllowed = displayMode === 'ai' || (displayMode === 'auto' && (bullets.length === 0 || (alsoCheck && alsoCheck.length > 2) || level === 'simple'));

  if (aiAllowed && process.env.AI_MODE !== 'off' && process.env.FETCH_ONLY !== 'true') {
    // Check Mongo Display Cache first
    if (mongoose.connection.readyState === 1) {
      try {
        const cached = await DisplayCache.findOne({ cacheKey }).lean();
        if (cached) {
          summaryText = cached.response.text || summaryText;
          explainedBy = 'ai';
          isCached = true;
          label = isTamil ? 'அதிகாரப்பூர்வ உரையிலிருந்து AI மூலம் எளிய விளக்கம்' : 'Explained with AI from official text. Confirm with the department.';
          await recordDisplayMetric('cacheHits');
        }
      } catch (e) {}
    }

    if (!isCached) {
      await recordDisplayMetric('cacheMisses');
      const callsToday = await getDisplayAiCallsToday();

      if (callsToday < DISPLAY_AI_MAX_CALLS_PER_DAY) {
        const aiResult = await generateAiExplanation({ scheme, facts, lang, level });
        if (aiResult) {
          summaryText = aiResult.text;
          explainedBy = 'ai';
          label = isTamil ? 'அதிகாரப்பூர்வ உரையிலிருந்து AI மூலம் எளிய விளக்கம்' : 'Explained with AI from official text. Confirm with the department.';

          // Cache in MongoDB
          if (mongoose.connection.readyState === 1) {
            try {
              await DisplayCache.findOneAndUpdate(
                { cacheKey },
                {
                  cacheKey,
                  schemeId: scheme._id,
                  contentHash,
                  language: lang,
                  readingLevel: level,
                  promptVersion: PROMPT_VERSION,
                  response: aiResult,
                  explainedBy: 'ai',
                  createdAt: new Date()
                },
                { upsert: true }
              );
            } catch (e) {}
          }
        }
      }
    }
  }

  if (explainedBy === 'algorithm') {
    console.log(`[${formatTime()}] DISPLAY algo "${scheme.name}" ok`);
    await recordDisplayMetric('algoSummaries');
  }

  // 3. Compute Deterministic Display State (Section 5)
  // - confirmed (read from the official page): facts with quotes, summary built by extractive algorithm, label "Official source confirmed"
  // - partial: scraped facts plus starter facts for missing fields, label "Partly confirmed"
  // - fetched_not_parsed: starter data, "Official page checked on <date>. Details not yet confirmed", expandable excerpts
  // - unreachable: starter data, "Official site not reachable on <date>: <plain reason>"
  // - never_checked: starter data, "Not yet confirmed"
  let displayState = 'never_checked';
  let displayBadge = 'Not yet confirmed';
  let displayNotice = null;
  let officialExcerpt = null;

  const vStatus = (scheme.verificationStatus || '').toLowerCase();
  const vLevel = (scheme.verificationLevel || '').toLowerCase();
  const checkDate = scheme.lastVerified ? new Date(scheme.lastVerified).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN');
  const hasOfficialQuote = facts.some(f => f.quote && f.quote.length > 5 && f.extractedBy !== 'synthetic');

  const sources = [...new Set(facts.map(f => f.source).filter(Boolean))];

  const { calculateCompleteness } = require('./completeness');
  const { areValuesDifferent, normalizeText } = require('./normalizer');
  const completeness = calculateCompleteness(scheme, facts);

  if ((vStatus === 'verified' || vStatus === 'confirmed' || vLevel === 'official') && hasOfficialQuote) {
    displayState = 'confirmed';
    displayBadge = 'Official source confirmed';
  } else if (facts.some(f => f.quote && f.extractedBy !== 'synthetic')) {
    displayState = 'partial';
    displayBadge = 'Partly confirmed';
    const missingStr = completeness.missingFields.length > 0 ? completeness.missingFields.join(', ') : 'none';
    displayNotice = `Partly confirmed from official sources on ${checkDate}. Not read from the official page: ${missingStr}`;
  } else if (vStatus === 'fetched_not_parsed' || (scheme.rawSourceText && scheme.rawSourceText.length > 200)) {
    displayState = 'fetched_not_parsed';
    displayBadge = 'Details not yet confirmed';
    displayNotice = `Official page checked on ${checkDate}. Details not yet confirmed`;
    officialExcerpt = (scheme.rawSourceText || '').substring(0, 1000).replace(/\s+/g, ' ').trim();
  } else if (vStatus === 'unreachable' || vStatus === 'tls_problem' || vStatus === 'blocked' || scheme.verificationReason) {
    displayState = 'unreachable';
    displayBadge = 'Official site not reachable';
    let plainReason = scheme.verificationReason || 'Connection issue';
    if (plainReason.includes('expired')) plainReason = 'Security certificate expired';
    else if (plainReason.includes('timeout')) plainReason = 'Server took too long to respond';
    else if (plainReason.includes('allowed')) plainReason = 'Domain not allowed';
    else if (plainReason.includes('JavaScript')) plainReason = 'Requires JavaScript';
    displayNotice = `Official site not reachable on ${checkDate}: ${plainReason}`;
  } else {
    displayState = 'never_checked';
    displayBadge = 'Not yet confirmed';
  }

  // Update verification badge chip
  const vChipIdx = chips.findIndex(c => c.label === (isTamil ? 'சரிபார்ப்பு' : 'Verified'));
  if (vChipIdx !== -1) {
    chips[vChipIdx].value = displayBadge;
  }

  // Compare View: starter value next to official value, with quote and highlight of real differences
  const compareView = [];
  const starter = scheme.starterData || {};
  if (starter.benefit || scheme.benefit) {
    const starterAmt = starter.benefit || scheme.benefit;
    const officialAmt = amountFact ? amountFact.quote : null;
    const isDifferent = officialAmt ? areValuesDifferent(starterAmt, officialAmt, 'benefit') : false;
    compareView.push({
      field: 'benefit',
      label: isTamil ? 'பயன்' : 'Benefit',
      starterValue: starterAmt,
      officialValue: officialAmt || 'Not found in official text',
      officialQuote: amountFact?.quote || null,
      isDifferent
    });
  }

  return {
    schemeId: scheme._id,
    name: schemeName,
    displayState,
    displayBadge,
    displayNotice,
    officialExcerpt,
    completenessScore: completeness.score,
    missingFields: completeness.missingFields,
    compareView,
    benefit,
    bullets: bullets.map(b => b.text),
    bulletDetails: bullets,
    conditions: alsoCheck.map(c => c.text),
    documents,
    steps,
    chips,
    summary: summaryText,
    summaryLabel: 'Summary from the official text',
    explainedBy,
    cached: isCached,
    factsVersion: contentHash,
    sources: sources.length > 0 ? sources : [scheme.sourceUrl || 'Official Tamil Nadu Government Portal']
  };
}

function buildCompareView(scheme = {}, facts = [], isTamil = false) {
  const { areValuesDifferent } = require('./normalizer');
  const compareView = [];
  const starter = scheme.starterData || {};
  const amountFact = facts.find(f => f.field === 'amount');
  if (starter.benefit || scheme.benefit) {
    const starterAmt = starter.benefit || scheme.benefit;
    const officialAmt = amountFact ? amountFact.quote : null;
    const isDifferent = officialAmt ? areValuesDifferent(starterAmt, officialAmt, 'benefit') : false;
    compareView.push({
      field: 'benefit',
      label: isTamil ? 'பயன்' : 'Benefit',
      starterValue: starterAmt,
      officialValue: officialAmt || 'Not found in official text',
      officialQuote: amountFact?.quote || null,
      isDifferent
    });
  }
  return {
    hasDifferences: compareView.some(c => c.isDifferent),
    differences: compareView
  };
}

module.exports = {
  presentScheme,
  buildCompareView,
  formatIndianNumber,
  renderBenefitLine,
  renderEligibilityBullets,
  cleanDocumentsAndSteps,
  extractiveSummarize,
  formatChangeMessage,
  calculateSchemeRankingScore,
  validateAiPresenterResponse,
  generateAiExplanation,
  inMemoryMetrics,
  getDisplayAiCallsToday,
  DISPLAY_AI_MAX_CALLS_PER_DAY
};
