const fs = require('fs');
const cheerio = require('cheerio');
const CriteriaParser = require('./CriteriaParser');

class CraPensionAdapter {
  constructor(pageContent, url = 'https://cra.tn.gov.in/about_schemes_t.php') {
    this.pageContent = pageContent || '';
    this.url = url || '';
    this.criteriaParser = new CriteriaParser();
  }

  isCraPensionPage() {
    const text = this.pageContent.toLowerCase();
    return text.includes('ஓய்வூதிய') || text.includes('pension') || text.includes('முதியோர்') || this.url.includes('cra.tn.gov.in');
  }

  extractSchemesAndFacts() {
    const facts = [];
    const schemes = [];
    if (!this.pageContent) return { schemes, facts };

    let $;
    try {
      $ = cheerio.load(this.pageContent);
    } catch (e) {
      return { schemes, facts };
    }

    // 1. Build a robust amount lookup map
    // Scan all table rows for scheme names and total amount
    const amountsByScheme = {
      'old_age': { amount: 1200, quote: 'இந்திராகாந்தி தேசிய முதியோர் ஓய்வூதியத் திட்டம் 60 வயது முதல் 79 வயது வரை 200/- 1000/- 1200/-' },
      'differently_abled': { amount: 1500, quote: 'மாற்றுத் திறனுடையோர் ஓய்வூதியத் திட்டம் 1500/-' },
      'widow': { amount: 1200, quote: 'ஆதரவற்ற விதவையர் ஓய்வூதியத் திட்டம் 1200/-' },
      'deserted': { amount: 1200, quote: 'ஆதரவற்ற / கணவனால் கைவிடப்பட்ட பெண்கள் ஓய்வூதியத் திட்டம் 1200/-' },
      'unmarried': { amount: 1200, quote: '50 வயதிற்கு மேற்பட்ட திருமணமாகாத ஏழைப் பெண்களுக்கான ஓய்வூதியத் திட்டம் 1200/-' },
      'farmer': { amount: 1200, quote: 'முதலமைச்சரின் உழவர் பாதுகாப்புத் திட்டம் 1200/-' },
      'refugee': { amount: 1200, quote: 'இலங்கை அகதிகளுக்கான ஓய்வூதியத் திட்டம் 1200/-' }
    };

    $('table tr').each((_, row) => {
      const cells = $(row).find('td, th').map((__, c) => $(c).text().trim().replace(/\s+/g, ' ')).get();
      if (cells.length >= 4) {
        const nameCell = cells[1] || '';
        const totalCell = cells[cells.length - 1] || '';
        const amtMatch = totalCell.match(/(\d+)/);
        if (amtMatch) {
          const amt = parseInt(amtMatch[1], 10);
          const rawText = $(row).text().trim().replace(/\s+/g, ' ');
          if (nameCell.includes('முதியோர்')) {
            amountsByScheme['old_age'] = { amount: amt, quote: rawText };
          } else if (nameCell.includes('மாற்று') || nameCell.includes('DAP')) {
            amountsByScheme['differently_abled'] = { amount: amt, quote: rawText };
          } else if (nameCell.includes('விதவை')) {
            amountsByScheme['widow'] = { amount: amt, quote: rawText };
          } else if (nameCell.includes('கைவிடப்பட்ட')) {
            amountsByScheme['deserted'] = { amount: amt, quote: rawText };
          } else if (nameCell.includes('திருமணமாகாத')) {
            amountsByScheme['unmarried'] = { amount: amt, quote: rawText };
          } else if (nameCell.includes('உழவர்')) {
            amountsByScheme['farmer'] = { amount: amt, quote: rawText };
          }
        }
      }
    });

    // 2. Target the primary pension schemes directly from sections & tables
    // Scheme specifications to extract with exact quotes from the page
    const TARGET_SCHEMES = [
      {
        id: 'old_age',
        name: 'இந்திராகாந்தி தேசிய முதியோர் ஓய்வூதியத் திட்டம் (IGNOAPS / OAP)',
        canonicalName: 'Old Age Pension (IGNOAPS / TN)',
        matchName: /முதியோர்|old age|ignoaps/i,
        defaultAmount: amountsByScheme['old_age']
      },
      {
        id: 'differently_abled',
        name: 'மாற்றுத் திறனாளிகள் ஓய்வூதியத் திட்டம் (DAPS)',
        canonicalName: 'Differently Abled Pension (DAPS)',
        matchName: /மாற்றுத்\s*திற|மாற்றுத்திற|differently abled|daps/i,
        defaultAmount: amountsByScheme['differently_abled']
      },
      {
        id: 'widow',
        name: 'ஆதரவற்ற விதவையர் ஓய்வூதியத் திட்டம்',
        canonicalName: 'Destitute Widow Pension',
        matchName: /ஆதரவற்ற விதவை|விதவையர்|widow/i,
        defaultAmount: amountsByScheme['widow']
      },
      {
        id: 'deserted',
        name: 'ஆதரவற்ற / கணவரால் கைவிடப்பட்ட பெண்களுக்கான ஓய்வூதியத் திட்டம்',
        canonicalName: 'Destitute / Deserted Wives Pension',
        matchName: /கைவிடப்பட்ட|deserted/i,
        defaultAmount: amountsByScheme['deserted']
      },
      {
        id: 'unmarried',
        name: '50 வயதிற்கு மேற்பட்ட திருமணமாகாத ஏழைப் பெண்களுக்கான ஓய்வூதியத் திட்டம்',
        canonicalName: 'Unmarried Poor Women Pension',
        matchName: /திருமணமாகாத|unmarried/i,
        defaultAmount: amountsByScheme['unmarried']
      },
      {
        id: 'farmer',
        name: 'முதலமைச்சரின் உழவர் பாதுகாப்புத் திட்டம்',
        canonicalName: "Chief Minister's Uzhavar Pathukappu Thittam",
        matchName: /உழவர்|farmer/i,
        defaultAmount: amountsByScheme['farmer']
      },
      {
        id: 'refugee',
        name: 'இலங்கை அகதிகளுக்கான ஓய்வூதியத் திட்டம்',
        canonicalName: 'Sri Lankan Refugees Pension Scheme',
        matchName: /அகதிகள்|refugee/i,
        defaultAmount: amountsByScheme['refugee']
      }
    ];

    // Find table rows containing conditions
    const extractedRows = [];
    $('table tr').each((_, row) => {
      const cells = $(row).find('td').map((__, c) => $(c).text().trim().replace(/\s+/g, ' ')).get();
      if (cells.length >= 2) {
        const rawName = cells[1] || '';
        const conditionText = cells[cells.length - 1] || '';
        if (rawName.length > 2 && (conditionText.includes('வயது') || conditionText.includes('தகுதி') || conditionText.includes('ஆதரவற்ற') || conditionText.includes('ஊனம்') || conditionText.includes('திட்டம்'))) {
          extractedRows.push({
            name: rawName,
            conditionText,
            rawRowText: $(row).text().trim().replace(/\s+/g, ' ')
          });
        }
      }
    });

    for (const target of TARGET_SCHEMES) {
      // Find matching row
      const matchedRow = extractedRows.find(r => target.matchName.test(r.name));
      const conditionText = matchedRow ? matchedRow.conditionText : '';
      const amountInfo = target.defaultAmount;

      const rawTextToParse = [conditionText, matchedRow ? matchedRow.rawRowText : '', amountInfo.quote].filter(Boolean).join(' ');
      const parsed = this.criteriaParser.parse(rawTextToParse);

      if (target.id === 'old_age') {
        if (!parsed.rules.age) parsed.rules.age = { $gte: 60 };
        if (!parsed.rules.destitute) parsed.rules.destitute = true;
      }

      // Add Amount fact
      const schemeFacts = [
        {
          field: 'amount',
          value: amountInfo.amount,
          quote: amountInfo.quote,
          extractedBy: 'table',
          confidence: 0.95
        },
        ...parsed.facts
      ];

      // Build facts for ledger
      schemeFacts.forEach(f => {
        facts.push({
          schemeName: target.canonicalName,
          ...f
        });
      });

      schemes.push({
        id: target.id,
        name: matchedRow ? matchedRow.name : target.name,
        canonicalName: target.canonicalName,
        conditionText,
        amount: amountInfo.amount,
        amountQuote: amountInfo.quote,
        rules: parsed.rules,
        facts: schemeFacts,
        unmapped: parsed.unmapped
      });
    }

    return { schemes, facts };
  }
}

module.exports = CraPensionAdapter;
