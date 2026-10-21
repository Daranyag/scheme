/**
 * Scheme Completeness Scorer & Merge Rule (AI-Free)
 *
 * Expected fields for standard scheme:
 * - benefit amount
 * - benefit frequency
 * - eligibility criteria
 * - documents
 * - application steps
 * - official link
 * - status
 */

const EXPECTED_FIELDS = [
  'amount',
  'frequency',
  'eligibility',
  'documents',
  'steps',
  'link',
  'status'
];

/**
 * Calculates completeness score (0 to 100) and identifies missing fields
 */
function calculateCompleteness(scheme = {}, facts = []) {
  const missing = [];
  let foundCount = 0;

  // 1. Benefit amount
  const hasAmountFact = facts.some(f => f.field === 'amount' && f.value);
  const hasBenefitProp = Boolean(scheme.benefit && /(?:₹|Rs\.?|INR|\d+)/i.test(scheme.benefit));
  if (hasAmountFact || hasBenefitProp) {
    foundCount++;
  } else {
    missing.push('benefit amount');
  }

  // 2. Benefit frequency
  const hasFreqFact = facts.some(f => f.field === 'amount' && f.frequency && f.frequency !== 'unspecified');
  const hasFreqProp = Boolean(scheme.benefit && /(?:month|year|annum|மாதம்|ஆண்டு|one-time)/i.test(scheme.benefit));
  if (hasFreqFact || hasFreqProp) {
    foundCount++;
  } else {
    missing.push('frequency');
  }

  // 3. Eligibility
  const rules = scheme.eligibilityRules || scheme.rules || {};
  const hasRule = Object.keys(rules).length > 0 || (scheme.unmappedCriteria && scheme.unmappedCriteria.length > 0);
  const hasEligibilityFact = facts.some(f => ['age', 'ageMin', 'incomeLimit', 'disabilityPercent', 'gender', 'maritalStatus', 'destitute'].includes(f.field));
  if (hasRule || hasEligibilityFact) {
    foundCount++;
  } else {
    missing.push('eligibility');
  }

  // 4. Documents
  const docs = scheme.requiredDocuments || scheme.docs || [];
  const hasDocFact = facts.some(f => f.field === 'document');
  if (docs.length > 0 || hasDocFact) {
    foundCount++;
  } else {
    missing.push('documents');
  }

  // 5. Steps / How to apply
  const steps = scheme.howToApply || scheme.steps || [];
  const hasStepFact = facts.some(f => f.field === 'step');
  if (steps.length > 0 || hasStepFact) {
    foundCount++;
  } else {
    missing.push('steps');
  }

  // 6. Official Link
  const links = scheme.officialLinks || scheme.links || [];
  if (links.length > 0 || scheme.sourceUrl) {
    foundCount++;
  } else {
    missing.push('link');
  }

  // 7. Status
  if (scheme.status || scheme.applicationStatus) {
    foundCount++;
  } else {
    missing.push('status');
  }

  const score = Math.round((foundCount / EXPECTED_FIELDS.length) * 100);
  return {
    score,
    foundCount,
    totalFields: EXPECTED_FIELDS.length,
    missingFields: missing
  };
}

/**
 * Merge Rule:
 * Official fetched facts win over starter facts.
 * Starter facts fill the gaps and are labelled "starter data".
 * Every displayed fact shows which source it came from.
 */
function mergeFactsWithStarter(scheme = {}, officialFacts = [], starterData = {}) {
  const mergedFacts = [];
  const starter = starterData || scheme.starterData || {};

  // Track what fields are covered officially
  const coveredFields = new Set();

  officialFacts.forEach(fact => {
    coveredFields.add(fact.field);
    mergedFacts.push({
      ...fact,
      sourceType: 'official',
      sourceLabel: 'Official page confirmed'
    });
  });

  // Gap filling from starter facts
  if (!coveredFields.has('amount') && (starter.benefit || scheme.benefit)) {
    mergedFacts.push({
      field: 'amount',
      value: starter.benefit || scheme.benefit,
      sourceType: 'starter',
      sourceLabel: 'Starter data',
      quote: null,
      extractedBy: 'starter'
    });
  }

  if (!coveredFields.has('documents') && ((starter.docs && starter.docs.length > 0) || (scheme.docs && scheme.docs.length > 0))) {
    mergedFacts.push({
      field: 'documents',
      value: starter.docs || scheme.docs,
      sourceType: 'starter',
      sourceLabel: 'Starter data',
      quote: null,
      extractedBy: 'starter'
    });
  }

  if (!coveredFields.has('steps') && ((starter.steps && starter.steps.length > 0) || (scheme.steps && scheme.steps.length > 0))) {
    mergedFacts.push({
      field: 'steps',
      value: starter.steps || scheme.steps,
      sourceType: 'starter',
      sourceLabel: 'Starter data',
      quote: null,
      extractedBy: 'starter'
    });
  }

  return mergedFacts;
}

function mergeWithOfficialFacts(starterScheme = {}, officialFacts = []) {
  const merged = { ...starterScheme, starterData: { ...starterScheme } };
  const officialAmount = officialFacts.find(f => f.field === 'amount');
  if (officialAmount) {
    merged.benefit = typeof officialAmount.value === 'number' ? `₹${officialAmount.value.toLocaleString('en-IN')}/month` : officialAmount.value;
  }
  const officialAge = officialFacts.find(f => f.field === 'age');
  if (officialAge) {
    merged.rules = { ...(merged.rules || {}), age: officialAge.value };
  }
  return merged;
}

module.exports = {
  EXPECTED_FIELDS,
  calculateCompleteness,
  mergeFactsWithStarter,
  mergeWithOfficialFacts
};
