/**
 * Section Splitter & Sentence Classifier (AI-Free)
 * Splits cleaned web pages by headings, bold lines, numbering, tables, and accordions.
 * Classifies sections into: benefit, eligibility, documents, apply, dates, contact, faq, other.
 * Classifies sentences with non-AI signal scoring.
 */

const cheerio = require('cheerio');

// Editable keyword dictionary with weights
const SECTION_KEYWORDS = {
  benefit: {
    weight: 1.2,
    terms: ['benefit', 'benefits', 'assistance', 'financial assistance', 'pension', 'grant', 'stipend', 'scholarship', 'subsidy', 'amount', 'allowance', 'பயன்கள்', 'உதவித்தொகை', 'திட்ட உதவி', 'நிதியுதவி', 'ஓய்வூதியம்']
  },
  eligibility: {
    weight: 1.5,
    terms: ['eligibility', 'eligibility criteria', 'who can apply', 'conditions', 'qualification', 'eligible', 'ineligible', 'தகுதி', 'தகுதிகள்', 'விண்ணப்பிக்க தகுதிகள்', 'நிபந்தனைகள்', 'யார் விண்ணப்பிக்கலாம்']
  },
  documents: {
    weight: 1.3,
    terms: ['documents', 'required documents', 'documents needed', 'certificates', 'enclosures', 'attachments', 'proof', 'ஆவணங்கள்', 'தேவையான ஆவணங்கள்', 'இணைக்கப்பட வேண்டியவை', 'சான்றிதழ்கள்']
  },
  apply: {
    weight: 1.2,
    terms: ['how to apply', 'procedure to apply', 'steps to apply', 'application procedure', 'apply online', 'submission', 'விண்ணப்பிக்கும் முறை', 'எவ்வாறு விண்ணப்பிப்பது', 'விண்ணப்ப செயல்முறை']
  },
  dates: {
    weight: 1.1,
    terms: ['dates', 'important dates', 'deadline', 'last date', 'schedule', 'timeline', 'கடைசி தேதி', 'முக்கிய தேதிகள்', 'காலக்கெடு']
  },
  contact: {
    weight: 1.0,
    terms: ['contact', 'helpline', 'toll free', 'address', 'officer', 'phone', 'helpdesk', 'தொடர்புக்கு', 'உதவி எண்', 'முகவரி']
  },
  faq: {
    weight: 1.0,
    terms: ['faq', 'frequently asked questions', 'q&a', 'questions', 'அடிக்கடி கேட்கப்படும் கேள்விகள்']
  }
};

/**
 * Classifies text heading or label into one of the target categories
 */
function classifyHeading(headingText = '', positionIndex = 0) {
  if (!headingText) return { category: 'other', confidence: 0 };
  const lower = headingText.toLowerCase().trim();

  let bestCat = 'other';
  let bestScore = 0;

  for (const [cat, conf] of Object.entries(SECTION_KEYWORDS)) {
    for (const term of conf.terms) {
      if (lower.includes(term.toLowerCase())) {
        const score = term.length * conf.weight;
        if (score > bestScore) {
          bestScore = score;
          bestCat = cat;
        }
      }
    }
  }

  // Position bonus for earlier sections
  if (bestScore > 0 && positionIndex < 3) {
    bestScore += 2;
  }

  return { category: bestCat, score: bestScore };
}

/**
 * Splits HTML or cleaned text into structured sections with category classification
 */
function splitSections(content = '', url = '') {
  if (!content) return [];
  const sections = [];

  const isHtml = content.includes('<') && content.includes('>');
  if (isHtml) {
    const $ = cheerio.load(content);
    // Remove unwanted chrome
    $('script, style, nav, footer, noscript').remove();

    // Scan headers, accordions, bold lines, summary/details
    let currentIndex = 0;
    $('h1, h2, h3, h4, h5, h6, strong, dt, summary, .accordion-header, .panel-title, th').each((idx, el) => {
      const heading = $(el).text().trim().replace(/\s+/g, ' ');
      if (heading.length < 3 || heading.length > 200) return;

      const { category, score } = classifyHeading(heading, currentIndex);

      // Collect sibling elements until next header
      let bodyText = '';
      let next = $(el).next();
      let hops = 0;
      while (next.length && hops < 8) {
        const tagName = next.prop('tagName')?.toLowerCase();
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'dt', 'summary'].includes(tagName)) break;
        const text = next.text().trim().replace(/\s+/g, ' ');
        if (text) bodyText += ' ' + text;
        next = next.next();
        hops++;
      }

      if (bodyText.trim().length > 15 || score > 0) {
        sections.push({
          index: currentIndex++,
          heading,
          category,
          text: bodyText.trim(),
          sourceUrl: url
        });
      }
    });

    // Also collect tables
    $('table').each((tIdx, tbl) => {
      const rows = [];
      $(tbl).find('tr').each((rIdx, row) => {
        const cells = $(row).find('td, th').map((_, c) => $(c).text().trim().replace(/\s+/g, ' ')).get();
        if (cells.length > 0) rows.push(cells.join(' | '));
      });
      if (rows.length > 0) {
        sections.push({
          index: currentIndex++,
          heading: `Table Section ${tIdx + 1}`,
          category: 'other',
          text: rows.join('\n'),
          sourceUrl: url
        });
      }
    });
  } else {
    // Plain text section splitter: split by bold markers, numbered lines, or double newlines
    const lines = content.split(/[\r\n]+/);
    let currentHeading = 'Overview';
    let currentText = [];
    let currentIndex = 0;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Check if line looks like heading: short, ends with colon, or numbered
      if ((trimmed.length < 80 && (trimmed.endsWith(':') || /^\d+[\.\)]\s+[A-Za-z\u0B80-\u0BFF]/.test(trimmed))) ||
          classifyHeading(trimmed).score > 0) {
        if (currentText.length > 0) {
          sections.push({
            index: currentIndex++,
            heading: currentHeading,
            category: classifyHeading(currentHeading).category,
            text: currentText.join(' '),
            sourceUrl: url
          });
          currentText = [];
        }
        currentHeading = trimmed.replace(/:$/, '');
      } else {
        currentText.push(trimmed);
      }
    });

    if (currentText.length > 0) {
      sections.push({
        index: currentIndex++,
        heading: currentHeading,
        category: classifyHeading(currentHeading).category,
        text: currentText.join(' '),
        sourceUrl: url
      });
    }
  }

  return sections;
}

/**
 * Non-AI sentence classifier
 * Scores each sentence for eligibility, benefit, document and procedure signals.
 */
function classifySentences(text = '') {
  if (!text) return [];

  // Protect dots in abbreviations
  const safeText = text
    .replace(/Rs\./gi, 'Rs__DOT__')
    .replace(/G\.O\./gi, 'GO__DOT__')
    .replace(/No\./gi, 'No__DOT__')
    .replace(/Dr\./gi, 'Dr__DOT__')
    .replace(/vs\./gi, 'vs__DOT__');

  const rawSentences = safeText
    .split(/(?<=[.?!])\s+/)
    .map(s => s.replace(/__DOT__/g, '.').trim())
    .filter(s => s.length >= 15);

  const modalWords = ['must', 'should', 'eligible', 'not eligible', 'required', 'shall', 'entitled', 'தேவை', 'வேண்டும்', 'உரியவர்', 'தகுதியுடையவர்'];
  const numberRegex = /\b\d+(?:,\d+)*(?:\.\d+)?\b|₹|ரூ/;

  return rawSentences.map((sentence, index) => {
    const lower = sentence.toLowerCase();
    let eligibilityScore = 0;
    let benefitScore = 0;
    let documentScore = 0;
    let procedureScore = 0;

    // Modals & numbers
    const hasModal = modalWords.some(m => lower.includes(m));
    const hasNumber = numberRegex.test(sentence);

    if (hasModal) eligibilityScore += 2;
    if (hasNumber) {
      benefitScore += 2;
      eligibilityScore += 1;
    }

    // Eligibility keywords
    if (/age|income|resident|widow|destitute|disability|student|வயது|வருமானம்|ஆதரவற்ற|விதவை|ஊனம்/i.test(sentence)) {
      eligibilityScore += 4;
    }

    // Benefit keywords
    if (/rs\.?|₹|month|year|annum|pension|assistance|grant|scholarship|மாதம்|ஆண்டு|உதவித்தொகை|ஓய்வூதியம்/i.test(sentence)) {
      benefitScore += 4;
    }

    // Document keywords
    if (/aadhaar|ration card|passbook|certificate|smart card|சான்றிதழ்|அட்டை/i.test(sentence)) {
      documentScore += 4;
    }

    // Procedure keywords
    if (/apply|portal|esevai|online|taluk|submit|விண்ணப்பிக்க|இணையதளம்/i.test(sentence)) {
      procedureScore += 4;
    }

    const maxScore = Math.max(eligibilityScore, benefitScore, documentScore, procedureScore);
    let primaryType = 'other';
    if (maxScore > 0) {
      if (maxScore === eligibilityScore) primaryType = 'eligibility';
      else if (maxScore === benefitScore) primaryType = 'benefit';
      else if (maxScore === documentScore) primaryType = 'document';
      else if (maxScore === procedureScore) primaryType = 'procedure';
    }

    return {
      index,
      sentence,
      type: primaryType,
      scores: { eligibility: eligibilityScore, benefit: benefitScore, document: documentScore, procedure: procedureScore },
      confidence: maxScore > 3 ? 0.9 : 0.7
    };
  });
}

function classifySentence(sentence) {
  const res = classifySentences(sentence);
  const item = res[0] || { type: 'other' };
  let cat = item.type;
  if (cat === 'document') cat = 'documents';
  if (cat === 'procedure') cat = 'apply';
  return {
    category: cat,
    type: item.type,
    scores: item.scores,
    sentence
  };
}

module.exports = {
  SECTION_KEYWORDS,
  classifyHeading,
  splitSections,
  classifySentences,
  classifySentence
};
