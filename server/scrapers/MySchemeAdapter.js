/**
 * Adapter for parsing myscheme.gov.in payload / bundle JSON for CMCHIS
 */

function parseMySchemePayload(content, url = 'https://www.myscheme.gov.in/schemes/cmchis') {
  let data = null;
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        data = JSON.parse(trimmed);
      } catch (e) {}
    } else if (trimmed.includes('__NEXT_DATA__')) {
      const match = trimmed.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (match && match[1]) {
        try {
          const nextData = JSON.parse(match[1]);
          data = nextData?.props?.pageProps?.schemeData || nextData?.props?.pageProps?.data || nextData;
        } catch (e) {}
      }
    }
  } else if (typeof content === 'object' && content !== null) {
    data = content;
  }

  if (!data) {
    return {
      success: false,
      facts: [],
      error: 'Unable to parse JSON payload'
    };
  }

  const facts = [];
  const countsByMethod = { selector: 0, regex: 0, rules: 0 };

  // 1. Benefit & Amount
  const benefitsArr = Array.isArray(data.benefits) ? data.benefits : (typeof data.benefits === 'string' ? [data.benefits] : []);
  const benefitQuote = benefitsArr[0] || data.briefDescription || '';

  let amount = null;
  const amtMatch = benefitQuote.match(/₹?\s*5[,.]00[,.]000|5\s*lakh/i);
  if (amtMatch) {
    amount = 500000;
    facts.push({
      field: 'amount',
      value: 500000,
      unit: '₹',
      frequency: 'per year',
      quote: benefitQuote,
      source: url,
      extractedBy: 'rules'
    });
    countsByMethod.rules++;
  }

  // Family coverage
  if (/family|floater/i.test(benefitQuote)) {
    facts.push({
      field: 'coverage',
      value: 'family floater',
      quote: benefitQuote,
      source: url,
      extractedBy: 'rules'
    });
    countsByMethod.rules++;
  }

  // 2. Eligibility Criteria
  const critList = Array.isArray(data.eligibilityCriteria) ? data.eligibilityCriteria : [];
  let incomeLimit = null;
  let residency = null;

  for (const crit of critList) {
    const text = typeof crit === 'string' ? crit : (crit.text || JSON.stringify(crit));

    // Annual income check
    const incMatch = text.match(/₹?\s*1[,.]20[,.]000|1\.2\s*lakh/i);
    if (incMatch) {
      incomeLimit = 120000;
      facts.push({
        field: 'income',
        value: { $lt: 120000 },
        quote: text,
        source: url,
        extractedBy: 'rules'
      });
      countsByMethod.rules++;
    }

    // Residency
    if (/residents? of tamil nadu/i.test(text)) {
      residency = 'Tamil Nadu';
      facts.push({
        field: 'residency',
        value: 'Tamil Nadu',
        quote: text,
        source: url,
        extractedBy: 'rules'
      });
      countsByMethod.rules++;
    }
  }

  // 3. Documents
  const docs = Array.isArray(data.documentsRequired) ? data.documentsRequired : [];
  if (docs.length > 0) {
    facts.push({
      field: 'documents',
      value: docs,
      quote: docs.join('; '),
      source: url,
      extractedBy: 'rules'
    });
    countsByMethod.rules++;
  }

  // 4. How to Apply
  const steps = Array.isArray(data.applicationProcess) ? data.applicationProcess : [];
  if (steps.length > 0) {
    facts.push({
      field: 'howToApply',
      value: steps,
      quote: steps.join('; '),
      source: url,
      extractedBy: 'rules'
    });
    countsByMethod.rules++;
  }

  return {
    success: true,
    schemeName: data.schemeName || 'Chief Minister Comprehensive Health Insurance Scheme (CMCHIS)',
    benefit: benefitQuote || 'Cashless health insurance cover up to ₹5,00,000 per family per year',
    amount,
    incomeLimit,
    residency,
    familyCoverage: true,
    documents: docs,
    howToApply: steps,
    facts,
    countsByMethod
  };
}

module.exports = {
  parseMySchemePayload
};
