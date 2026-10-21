/**
 * Shared Field Extractors
 * Extracts amounts, ages, income limits, percentages, dates, and G.O. numbers with exact quotes.
 */

function sanitizeSnippet(str) {
  return (str || '').replace(/\s+/g, ' ').trim();
}

function extractQuoteAround(text, matchIndex, matchLength, margin = 25) {
  const start = Math.max(0, matchIndex - margin);
  const end = Math.min(text.length, matchIndex + matchLength + margin);
  return text.substring(start, end).trim();
}

function verifyQuoteInText(quote, text) {
  if (!quote || !text) return false;
  return text.includes(quote);
}

/**
 * Extract monetary benefit amounts
 */
function extractAmounts(text) {
  const results = [];
  if (!text) return results;

  const patterns = [
    {
      regex: /(?:₹|Rs\.?|INR)\s*([\d,]+)(?:\s*\/-)?(?:\s*(?:\/|\s*per|\s*a)\s*(month|மாதம்|annum|year|ஆண்டு|one-time))?/gi,
      type: 'currency'
    },
    {
      regex: /(?:pension|assistance|grant|financial assistance|scholarship)\s*(?:of\s*)?(?:₹|Rs\.?|INR)\s*([\d,]+)/gi,
      type: 'benefit'
    },
    {
      regex: /உதவித்தொகை\s*(?:ரூ\.?|₹)\s*([\d,]+)/gi,
      type: 'tamil_benefit'
    }
  ];

  for (const { regex } of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const rawNum = match[1].replace(/,/g, '');
      const value = parseInt(rawNum, 10);
      if (isNaN(value) || value <= 0 || value > 5000000) continue;

      const fullMatch = match[0];
      const quote = extractQuoteAround(text, match.index, fullMatch.length, 15);
      const isMonthly = /month|மாதம்|\/pm|\/mo/i.test(fullMatch) || /per month|மாதந்தோறும்/i.test(quote);
      const isAnnual = /annum|year|ஆண்டு/i.test(fullMatch);
      const frequency = isMonthly ? 'monthly' : (isAnnual ? 'annual' : 'unspecified');

      results.push({
        field: 'amount',
        value,
        frequency,
        display: `₹${value.toLocaleString('en-IN')}${frequency === 'monthly' ? '/month' : ''}`,
        quote,
        confidence: 0.95,
        extractedBy: 'regex'
      });
    }
  }

  // Deduplicate by value
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.value)) return false;
    seen.add(r.value);
    return true;
  });
}

/**
 * Extract age criteria
 */
function extractAges(text) {
  const results = [];
  if (!text) return results;

  const patterns = [
    {
      regex: /(?:age|aged)\s*(?:of\s*)?(\d{1,2})\s*(?:years|yrs)?\s*(?:and\s*above|or\s*above|or\s*more|\+)/gi,
      op: '$gte',
      param: 'min'
    },
    {
      regex: /(?:above|minimum\s*age\s*of)\s*(\d{1,2})\s*(?:years|yrs)/gi,
      op: '$gte',
      param: 'min'
    },
    {
      regex: /(?:between\s*)?(\d{1,2})\s*(?:to|–|-|and)\s*(\d{1,2})\s*(?:years|yrs)/gi,
      op: 'range'
    },
    {
      regex: /(\d{1,2})\s*வயது\s*மற்றும்\s*அதற்கு\s*மேல்/gi,
      op: '$gte',
      param: 'min'
    },
    {
      regex: /(\d{1,2})\s*வயதுக்கு\s*மேற்பட்ட/gi,
      op: '$gte',
      param: 'min'
    }
  ];

  for (const p of patterns) {
    let match;
    while ((match = p.regex.exec(text)) !== null) {
      const quote = extractQuoteAround(text, match.index, match[0].length, 15);
      if (p.op === 'range') {
        const min = parseInt(match[1], 10);
        const max = parseInt(match[2], 10);
        if (min >= 1 && min <= 100 && max >= min && max <= 100) {
          results.push({
            field: 'ageRange',
            value: { min, max },
            rule: { age: { $gte: min, $lte: max } },
            quote,
            confidence: 0.95,
            extractedBy: 'regex'
          });
        }
      } else {
        const age = parseInt(match[1], 10);
        if (age >= 1 && age <= 100) {
          results.push({
            field: 'ageMin',
            value: age,
            rule: { age: { [p.op]: age } },
            quote,
            confidence: 0.95,
            extractedBy: 'regex'
          });
        }
      }
    }
  }

  const seen = new Set();
  return results.filter(r => {
    const k = JSON.stringify(r.value);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Extract income limits
 */
function extractIncomeLimits(text) {
  const results = [];
  if (!text) return results;

  const patterns = [
    /(?:annual|family|household)?\s*income\s*(?:should\s*)?(?:not\s*exceed|below|less\s*than|within|up\s*to)\s*(?:rs\.?|₹)?\s*([\d,]+)/gi,
    /income\s*limit\s*(?:is\s*)?(?:rs\.?|₹)?\s*([\d,]+)/gi,
    /வருமான\s*வரம்பு\s*(?:ரூ\.?|₹)?\s*([\d,]+)/gi,
    /வருமானம்\s*(?:ரூ\.?|₹)?\s*([\d,]+)(?:-க்கு\s*மிகைப்படாமல்|-க்குள்)/gi
  ];

  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const rawNum = match[1].replace(/,/g, '');
      const value = parseInt(rawNum, 10);
      if (isNaN(value) || value < 1000 || value > 10000000) continue;

      const quote = extractQuoteAround(text, match.index, match[0].length, 20);
      results.push({
        field: 'incomeLimit',
        value,
        rule: { annualIncome: { $lte: value } },
        display: `₹${value.toLocaleString('en-IN')}`,
        quote,
        confidence: 0.95,
        extractedBy: 'regex'
      });
    }
  }

  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.value)) return false;
    seen.add(r.value);
    return true;
  });
}

/**
 * Extract disability or quota percentages
 */
function extractPercentages(text) {
  const results = [];
  if (!text) return results;

  const patterns = [
    /(\d{1,3})\s*%\s*(?:or\s*more|and\s*above)?\s*(?:disability|differently\s*abled)/gi,
    /(?:disability|differently\s*abled)\s*(?:of\s*)?(\d{1,3})\s*%/gi,
    /(\d{1,3})\s*%\s*(?:மற்றும்\s*அதற்கு\s*மேற்பட்ட\s*)?ஊனம்/gi
  ];

  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const percent = parseInt(match[1], 10);
      if (isNaN(percent) || percent <= 0 || percent > 100) continue;

      const quote = extractQuoteAround(text, match.index, match[0].length, 15);
      results.push({
        field: 'disabilityPercent',
        value: percent,
        rule: { disabilityPercent: { $gte: percent } },
        display: `${percent}% disability`,
        quote,
        confidence: 0.95,
        extractedBy: 'regex'
      });
    }
  }

  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.value)) return false;
    seen.add(r.value);
    return true;
  });
}

/**
 * Extract dates
 */
function extractDates(text) {
  const results = [];
  if (!text) return results;

  const patterns = [
    /(?:dated|effective\s*from|from|on)\s*:?\s*(\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{2,4})/gi,
    /(\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s+\d{4})/gi
  ];

  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const dateStr = match[1];
      const quote = extractQuoteAround(text, match.index, match[0].length, 15);
      results.push({
        field: 'date',
        value: dateStr,
        quote,
        confidence: 0.90,
        extractedBy: 'regex'
      });
    }
  }

  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.value)) return false;
    seen.add(r.value);
    return true;
  });
}

/**
 * Extract G.O. (Government Order) numbers
 */
function extractGoNumbers(text) {
  const results = [];
  if (!text) return results;

  const patterns = [
    /G\.O\.?\s*(?:\([A-Za-z]+\)\s*)?No\.?\s*([\d\/\-]+(?:\s*dated\s*[\d\.\-\/]+)?)/gi,
    /அரசாணை\s*(?:எண்)?\.?\s*([\d\/\-]+)/gi
  ];

  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const goNumber = match[1].trim();
      const quote = extractQuoteAround(text, match.index, match[0].length, 15);
      results.push({
        field: 'goNumber',
        value: goNumber,
        quote,
        confidence: 0.95,
        extractedBy: 'regex'
      });
    }
  }

  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.value)) return false;
    seen.add(r.value);
    return true;
  });
}

/**
 * Extract Application Status, Deadlines and Notices (Section 4)
 * Detects: open, closed, upcoming, last date, extended up to with exact quotes.
 */
function extractApplicationNotices(text) {
  const results = [];
  if (!text) return results;

  const patterns = [
    // Closed patterns
    {
      regex: /(?:applications?\s+(?:are\s+)?closed\s*(?:on|from|as on)?\s*|closed on\s*|கடைசி தேதி முடிவடைந்தது|விண்ணப்பங்கள் முடிவடைந்தது)\s*:?\s*(\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+,?\s+\d{4})?/i,
      status: 'closed',
      type: 'closed'
    },
    // Last date / deadline patterns
    {
      regex: /(?:last\s*date\s*(?:for\s*(?:submission|application|applying|registration))?[^:]*?:\s*|last\s*date\s*(?:is|:)?\s*|கடைசி நாள்\s*:?\s*|கடைசி தேதி\s*:?\s*)(\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+,?\s+\d{4})/i,
      status: 'open',
      type: 'deadline'
    },
    // Extended date patterns (must include date)
    {
      regex: /(?:(?:last\s*date|deadline|submission|application|registration)\s+)?(?:extended\s*(?:up to|to|till)\s*|நீட்டிக்கப்பட்டுள்ளது\s*:?\s*)(\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+,?\s+\d{4})/i,
      status: 'open',
      type: 'extended'
    },
    // Open / Applications invited
    {
      regex: /(?:applications\s*(?:are\s*)?invited|applications\s*now\s*open|apply\s*online\s*now|portal\s*open\s*for\s*(?:fresh|renewal)|விண்ணப்பங்கள் வரவேற்கப்படுகின்றன)/i,
      status: 'open',
      type: 'open'
    },
    // Upcoming / New academic year notice
    {
      regex: /(?:applications?\s*(?:will\s*open|commences?\s*from)|portal\s*will\s*open|விரைவில் தொடங்கப்படும்)/i,
      status: 'upcoming',
      type: 'upcoming'
    }
  ];

  for (const p of patterns) {
    const match = text.match(p.regex);
    if (match) {
      const quote = extractQuoteAround(text, match.index, match[0].length, 25);
      const dateStr = match[1] ? match[1].trim() : null;
      results.push({
        status: p.status,
        type: p.type,
        date: dateStr,
        quote,
        confidence: 0.95
      });
    }
  }

  return results;
}

module.exports = {
  extractAmounts,
  extractAges,
  extractIncomeLimits,
  extractPercentages,
  extractDates,
  extractGoNumbers,
  extractApplicationNotices,
  extractQuoteAround,
  verifyQuoteInText
};
