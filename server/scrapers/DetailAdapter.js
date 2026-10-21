const cheerio = require('cheerio');
const CriteriaParser = require('./CriteriaParser');
const {
  extractAmounts,
  extractAges,
  extractIncomeLimits,
  extractPercentages,
  extractGoNumbers,
  extractQuoteAround
} = require('./fieldExtractors');

// Standard heading dictionary for official Tamil Nadu scheme portals
const HEADING_DICTIONARY = {
  eligibility: [
    'eligibility', 'eligibility criteria', 'who can apply', 'conditions', 'தகுதி', 'தகுதிகள்', 'விண்ணப்பிக்க தகுதிகள்'
  ],
  benefits: [
    'benefits', 'assistance', 'assistance provided', 'scheme assistance', 'பயன்கள்', 'உதவித்தொகை', 'திட்ட உதவி'
  ],
  documents: [
    'documents required', 'required documents', 'certificates needed', 'தேவையான ஆவணங்கள்', 'இணைக்கப்பட வேண்டிய ஆவணங்கள்'
  ],
  apply: [
    'how to apply', 'procedure to apply', 'application procedure', 'steps to apply', 'விண்ணப்பிக்கும் முறை', 'எவ்வாறு விண்ணப்பிப்பது'
  ],
  orders: [
    'government orders', 'g.o.', 'g.o. ms. no', 'அரசாணை', 'அரசாணைகள்'
  ]
};

class DetailAdapter {
  constructor(pageContent, url) {
    this.pageContent = pageContent || '';
    this.url = url || '';
    this.criteriaParser = new CriteriaParser();
  }

  extractSections() {
    const facts = [];
    const sections = [];
    const result = {
      eligibilityRules: {},
      requiredDocuments: [],
      howToApply: [],
      benefit: null,
      goNumber: null,
      sections: [],
      unmappedConditions: [],
      facts: []
    };

    if (!this.pageContent) return result;

    let $;
    let isHtml = false;
    try {
      if (this.pageContent.includes('<') && this.pageContent.includes('>')) {
        $ = cheerio.load(this.pageContent);
        isHtml = true;
      }
    } catch (e) {}

    const text = isHtml ? $('body').text() || this.pageContent : this.pageContent;

    // 0. Extract structured sections using Heading Dictionary
    if (isHtml) {
      $('h1, h2, h3, h4, h5, th, strong').each((i, el) => {
        const headingText = $(el).text().trim();
        const headingLower = headingText.toLowerCase();
        let matchedCategory = null;

        for (const [cat, keywords] of Object.entries(HEADING_DICTIONARY)) {
          if (keywords.some(kw => headingLower.includes(kw))) {
            matchedCategory = cat;
            break;
          }
        }

        if (matchedCategory || headingText.length > 3) {
          // Collect adjacent paragraph/list text
          let bodyText = '';
          let next = $(el).next();
          let hops = 0;
          while (next.length && hops < 3) {
            const tagName = next.prop('tagName')?.toLowerCase();
            if (['h1', 'h2', 'h3', 'h4', 'h5'].includes(tagName)) break;
            bodyText += ' ' + next.text().trim();
            next = next.next();
            hops++;
          }

          if (bodyText.trim().length > 15) {
            sections.push({
              heading: headingText,
              category: matchedCategory || 'general',
              text: bodyText.trim(),
              sourceUrl: this.url
            });
          }
        }
      });
    }

    result.sections = sections;

    // 1. Extract Amounts / Benefit
    const amounts = extractAmounts(text);
    if (amounts.length > 0) {
      result.benefit = amounts[0].display;
      amounts.forEach(a => {
        facts.push({
          field: 'amount',
          value: a.value,
          quote: a.quote,
          extractedBy: isHtml ? 'selector' : 'regex',
          confidence: a.confidence
        });
      });
    }

    // 2. Extract Criteria / Ages / Incomes
    const parsedCriteria = this.criteriaParser.parse(text);
    result.eligibilityRules = { ...parsedCriteria.rules };
    result.unmappedConditions = parsedCriteria.unmapped || [];
    parsedCriteria.facts.forEach(f => facts.push(f));

    const ages = extractAges(text);
    ages.forEach(a => {
      if (a.rule && a.rule.age && !result.eligibilityRules.age) {
        result.eligibilityRules.age = a.rule.age;
      }
      facts.push({
        field: a.field,
        value: a.value,
        quote: a.quote,
        extractedBy: 'regex',
        confidence: a.confidence
      });
    });

    const incomes = extractIncomeLimits(text);
    incomes.forEach(inc => {
      if (inc.rule && inc.rule.annualIncome && !result.eligibilityRules.annualIncome) {
        result.eligibilityRules.annualIncome = inc.rule.annualIncome;
      }
      facts.push({
        field: 'incomeLimit',
        value: inc.value,
        quote: inc.quote,
        extractedBy: 'regex',
        confidence: inc.confidence
      });
    });

    const percentages = extractPercentages(text);
    percentages.forEach(p => {
      facts.push({
        field: 'disabilityPercent',
        value: p.value,
        quote: p.quote,
        extractedBy: 'regex',
        confidence: p.confidence
      });
    });

    // 3. Extract G.O. Numbers
    const gos = extractGoNumbers(text);
    if (gos.length > 0) {
      result.goNumber = gos[0].value;
      gos.forEach(g => {
        facts.push({
          field: 'goNumber',
          value: g.value,
          quote: g.quote,
          extractedBy: 'regex',
          confidence: g.confidence
        });
      });
    }

    // 4. Extract Documents Required
    const docKeywords = [
      'aadhaar', 'ration card', 'smart card', 'income certificate',
      'community certificate', 'destitute widow certificate', 'bank passbook',
      'disability certificate', 'passport photo', 'udid card', 'transfer certificate',
      'emis number', 'legal heir certificate'
    ];
    docKeywords.forEach(doc => {
      const idx = text.toLowerCase().indexOf(doc);
      if (idx !== -1) {
        const quote = extractQuoteAround(text, idx, doc.length, 15);
        result.requiredDocuments.push(doc.charAt(0).toUpperCase() + doc.slice(1));
        facts.push({
          field: 'document',
          value: doc,
          quote,
          extractedBy: 'rules',
          confidence: 0.90
        });
      }
    });

    // 5. Extract Steps / How to Apply
    if (isHtml) {
      $('ol li, ul li').each((i, el) => {
        const line = $(el).text().trim();
        if (line.length > 20 && line.length < 300) {
          const lower = line.toLowerCase();
          if (lower.includes('apply') || lower.includes('portal') || lower.includes('submit') || lower.includes('register') || lower.includes('camp') || lower.includes('esevai')) {
            result.howToApply.push(line);
            facts.push({
              field: 'step',
              value: line,
              quote: line.substring(0, 50),
              extractedBy: 'selector',
              confidence: 0.85
            });
          }
        }
      });
    }

    result.facts = facts;
    return result;
  }
}

module.exports = DetailAdapter;
