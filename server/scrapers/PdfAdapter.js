const CriteriaParser = require('./CriteriaParser');
const {
  extractAmounts,
  extractAges,
  extractDates,
  extractGoNumbers
} = require('./fieldExtractors');

class PdfAdapter {
  constructor(pdfText, url) {
    this.pdfText = pdfText || '';
    this.url = url || '';
    this.criteriaParser = new CriteriaParser();
  }

  extractFields() {
    const facts = [];
    const result = {
      goNumber: null,
      date: null,
      benefit: null,
      eligibilityRules: {},
      facts: []
    };

    if (!this.pdfText) return result;

    // 1. GO Numbers
    const gos = extractGoNumbers(this.pdfText);
    if (gos.length > 0) {
      result.goNumber = gos[0].value;
      gos.forEach(g => {
        facts.push({
          field: 'goNumber',
          value: g.value,
          quote: g.quote,
          extractedBy: 'regex',
          confidence: 0.95
        });
      });
    }

    // 2. Dates
    const dates = extractDates(this.pdfText);
    if (dates.length > 0) {
      result.date = dates[0].value;
      dates.forEach(d => {
        facts.push({
          field: 'goDate',
          value: d.value,
          quote: d.quote,
          extractedBy: 'regex',
          confidence: 0.90
        });
      });
    }

    // 3. Amounts / Benefits
    const amounts = extractAmounts(this.pdfText);
    if (amounts.length > 0) {
      result.benefit = amounts[0].display;
      amounts.forEach(a => {
        facts.push({
          field: 'amount',
          value: a.value,
          quote: a.quote,
          extractedBy: 'regex',
          confidence: 0.95
        });
      });
    }

    // 4. Criteria
    const parsedCriteria = this.criteriaParser.parse(this.pdfText);
    result.eligibilityRules = parsedCriteria.rules;
    parsedCriteria.facts.forEach(f => facts.push(f));

    result.facts = facts;
    return result;
  }
}

module.exports = PdfAdapter;
