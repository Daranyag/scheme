const cheerio = require('cheerio');
const CriteriaParser = require('./CriteriaParser');
const { extractAmounts, extractAges, extractGoNumbers } = require('./fieldExtractors');

class TableAdapter {
  constructor(pageContent, url) {
    this.pageContent = pageContent || '';
    this.url = url || '';
    this.criteriaParser = new CriteriaParser();
  }

  extractTable() {
    const rows = [];
    const facts = [];
    if (!this.pageContent) return { rows, facts };

    try {
      const $ = cheerio.load(this.pageContent);
      $('table').each((tableIdx, tableEl) => {
        const headers = [];
        $(tableEl).find('tr').each((rowIdx, trEl) => {
          const ths = $(trEl).find('th');
          if (ths.length > 0 && headers.length === 0) {
            ths.each((_, th) => headers.push($(th).text().trim().toLowerCase()));
            return;
          }

          const tds = $(trEl).find('td');
          if (tds.length === 0) return;

          const rowData = {};
          const rowText = $(trEl).text().replace(/\s+/g, ' ').trim();
          tds.each((colIdx, td) => {
            const headerName = headers[colIdx] || `col_${colIdx}`;
            const cellText = $(td).text().replace(/\s+/g, ' ').trim();
            rowData[headerName] = cellText;
          });

          // Check for scheme name, benefit, criteria in this row
          const schemeNameMatch = rowData['scheme'] || rowData['scheme name'] || rowData['name of scheme'] || rowData['col_1'] || Object.values(rowData)[0];
          const benefitText = rowData['amount'] || rowData['benefit'] || rowData['assistance'] || rowData['pension'] || rowText;
          const conditionText = rowData['eligibility'] || rowData['conditions'] || rowData['criteria'] || rowText;

          if (schemeNameMatch && schemeNameMatch.length > 3) {
            const parsedCriteria = this.criteriaParser.parse(conditionText);
            const amounts = extractAmounts(benefitText);
            const ages = extractAges(conditionText);
            const gos = extractGoNumbers(rowText);

            const rowItem = {
              name: schemeNameMatch,
              benefit: amounts[0]?.display || (benefitText.length < 100 ? benefitText : 'Assistance'),
              eligibilityRules: parsedCriteria.rules,
              rawRow: rowText
            };

            if (amounts[0]) {
              facts.push({
                field: 'amount',
                value: amounts[0].value,
                quote: amounts[0].quote,
                extractedBy: 'selector',
                confidence: 0.95
              });
            }

            if (ages[0]) {
              facts.push({
                field: 'ageMin',
                value: ages[0].value,
                quote: ages[0].quote,
                extractedBy: 'selector',
                confidence: 0.95
              });
            }

            if (gos[0]) {
              facts.push({
                field: 'goNumber',
                value: gos[0].value,
                quote: gos[0].quote,
                extractedBy: 'selector',
                confidence: 0.95
              });
            }

            rows.push(rowItem);
          }
        });
      });
    } catch (e) {
      // Non-HTML or cheerio error
    }

    // Text fallback if no HTML table was parsed
    if (rows.length === 0 && this.pageContent.toLowerCase().includes('scheme')) {
      const parsedCriteria = this.criteriaParser.parse(this.pageContent);
      const amounts = extractAmounts(this.pageContent);
      if (amounts.length > 0) {
        rows.push({
          name: 'Extracted Pension Scheme',
          benefit: amounts[0].display,
          eligibilityRules: parsedCriteria.rules
        });
        facts.push({
          field: 'amount',
          value: amounts[0].value,
          quote: amounts[0].quote,
          extractedBy: 'regex',
          confidence: 0.90
        });
      }
    }

    return { rows, facts };
  }
}

module.exports = TableAdapter;
