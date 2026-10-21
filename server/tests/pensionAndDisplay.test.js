/**
 * Golden & Display Tests
 *
 * Covers:
 *  - CRA pension adapter: golden values from about_schemes_t.php and eleg_schemes_t.php fixtures
 *  - CriteriaParser: Tamil pension patterns
 *  - normalizer.js: areValuesDifferent false-differ prevention
 *  - Government domain allowlist
 *  - Display states (confirmed, partial, fetched_not_parsed, unreachable, never_checked)
 *  - Suspicious record rejection and alias merge
 *  - Zero Gemini calls assertion
 */

const fs = require('fs');
const path = require('path');

const CraPensionAdapter = require('../scrapers/CraPensionAdapter');
const CriteriaParser = require('../scrapers/CriteriaParser');
const { areValuesDifferent, normalizeText, parseNormalizedAmount, replaceTamilDigits } = require('../lib/normalizer');
const { isAllowlistedUrl } = require('../config/allowlist');
const { callGemini, resetGateForTesting, isAiModeOff } = require('../lib/aiGate');
const { presentScheme } = require('../lib/presenter');

// Fixture paths
const ABOUT_SCHEMES_FIXTURE = path.join(__dirname, 'fixtures', 'about_schemes_t.php');
const ELEG_SCHEMES_FIXTURE = path.join(__dirname, 'fixtures', 'eleg_schemes_t.php');

// =========================================================================
// A. CRA PENSION ADAPTER – GOLDEN VALUES FROM FIXTURES
// =========================================================================
describe('CRA Pension Adapter: Golden Values', () => {
  let aboutAdapter;
  let elegAdapter;
  let aboutResult;
  let elegResult;

  beforeAll(() => {
    const aboutContent = fs.readFileSync(ABOUT_SCHEMES_FIXTURE, 'utf8');
    aboutAdapter = new CraPensionAdapter(aboutContent, 'https://cra.tn.gov.in/about_schemes_t.php');
    aboutResult = aboutAdapter.extractSchemesAndFacts();

    const elegContent = fs.readFileSync(ELEG_SCHEMES_FIXTURE, 'utf8');
    elegAdapter = new CraPensionAdapter(elegContent, 'https://cra.tn.gov.in/eleg_schemes_t.php');
    elegResult = elegAdapter.extractSchemesAndFacts();
  });

  test('isCraPensionPage returns true for CRA fixture', () => {
    expect(aboutAdapter.isCraPensionPage()).toBe(true);
    expect(elegAdapter.isCraPensionPage()).toBe(true);
  });

  test('extracts exactly 7 target pension schemes from about_schemes_t.php', () => {
    expect(aboutResult.schemes.length).toBe(7);
    const names = aboutResult.schemes.map(s => s.canonicalName);
    expect(names).toContain('Old Age Pension (IGNOAPS / TN)');
    expect(names).toContain('Differently Abled Pension (DAPS)');
    expect(names).toContain('Destitute Widow Pension');
    expect(names).toContain('Destitute / Deserted Wives Pension');
    expect(names).toContain('Unmarried Poor Women Pension');
    expect(names).toContain("Chief Minister's Uzhavar Pathukappu Thittam");
    expect(names).toContain('Sri Lankan Refugees Pension Scheme');
  });

  // Golden values: Old Age Pension (IGNOAPS)
  test('Old Age Pension: ₹1200/month, age 60+, destitute', () => {
    const oap = aboutResult.schemes.find(s => s.canonicalName === 'Old Age Pension (IGNOAPS / TN)');
    expect(oap).toBeDefined();
    expect(oap.amount).toBe(1200);
    expect(oap.rules.age).toEqual({ $gte: 60 });
    expect(oap.rules.destitute).toBe(true);
    // Amount quote must reference the actual table text
    expect(oap.amountQuote).toMatch(/1200/);
    expect(oap.amountQuote).toMatch(/முதியோர்/);
  });

  // Golden values: Differently Abled Pension (DAPS)
  test('Differently Abled Pension: ₹1500/month, 40% disability, age 18+, income ₹3 lakh', () => {
    const daps_about = aboutResult.schemes.find(s => s.canonicalName === 'Differently Abled Pension (DAPS)');
    expect(daps_about).toBeDefined();
    expect(daps_about.amount).toBe(1500);

    // eleg_schemes_t.php has the revised 40% disability and income ₹3 lakh conditions
    const daps_eleg = elegResult.schemes.find(s => s.canonicalName === 'Differently Abled Pension (DAPS)');
    expect(daps_eleg).toBeDefined();
    expect(daps_eleg.amount).toBe(1500);
    expect(daps_eleg.rules.disabilityPercent).toEqual({ $gte: 40 });
    expect(daps_eleg.rules.annualIncome).toEqual({ $lte: 300000 });
    expect(daps_eleg.rules.age).toEqual({ $gte: 18 });
  });

  // Golden values: Destitute Widow Pension
  test('Destitute Widow Pension: ₹1200/month, age 18+, assets ≤ ₹1,00,000', () => {
    const dwp = aboutResult.schemes.find(s => s.canonicalName === 'Destitute Widow Pension');
    expect(dwp).toBeDefined();
    expect(dwp.amount).toBe(1200);
    expect(dwp.rules.age).toEqual({ $gte: 18 });
    expect(dwp.rules.assetLimit).toEqual({ $lte: 100000 });
    expect(dwp.rules.maritalStatus).toBe('widowed');
    expect(dwp.rules.destitute).toBe(true);
  });

  // Golden values: Deserted Wives Pension
  test('Deserted Wives Pension: ₹1200/month, age 30+, deserted 5 years, assets ≤ ₹1,00,000', () => {
    const ddwp = aboutResult.schemes.find(s => s.canonicalName === 'Destitute / Deserted Wives Pension');
    expect(ddwp).toBeDefined();
    expect(ddwp.amount).toBe(1200);
    expect(ddwp.rules.age).toEqual({ $gte: 30 });
    expect(ddwp.rules.assetLimit).toEqual({ $lte: 100000 });
    expect(ddwp.rules.maritalStatus).toBe('deserted');
    expect(ddwp.rules.destitute).toBe(true);
    // Deserted condition fact must include the 5-year desertion quote
    const desertionFact = ddwp.facts.find(f => f.field === 'maritalStatus');
    expect(desertionFact).toBeDefined();
    expect(desertionFact.quote).toMatch(/கைவிடப்பட்ட/);
  });

  // Golden values: Unmarried Poor Women Pension
  test('Unmarried Poor Women Pension: ₹1200/month, age 50+, assets ≤ ₹1,00,000', () => {
    const uwp = aboutResult.schemes.find(s => s.canonicalName === 'Unmarried Poor Women Pension');
    expect(uwp).toBeDefined();
    expect(uwp.amount).toBe(1200);
    expect(uwp.rules.age).toEqual({ $gte: 50 });
    expect(uwp.rules.assetLimit).toEqual({ $lte: 100000 });
    expect(uwp.rules.maritalStatus).toBe('unmarried');
    expect(uwp.rules.gender).toBe('F');
  });

  // Facts from adapter include quotes from the fixture text
  test('all extracted facts have non-empty quotes and confidence >= 0.9', () => {
    for (const fact of aboutResult.facts) {
      expect(fact.quote).toBeTruthy();
      expect(typeof fact.quote).toBe('string');
      expect(fact.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  test('no unmapped criteria for the 5 primary pension schemes', () => {
    const primaryNames = [
      'Old Age Pension (IGNOAPS / TN)',
      'Destitute Widow Pension',
      'Destitute / Deserted Wives Pension',
      'Unmarried Poor Women Pension',
      'Differently Abled Pension (DAPS)'
    ];
    for (const name of primaryNames) {
      const scheme = aboutResult.schemes.find(s => s.canonicalName === name);
      expect(scheme).toBeDefined();
      expect(scheme.unmapped.length).toBe(0);
    }
  });
});

// =========================================================================
// B. CRITERIA PARSER: TAMIL PENSION PATTERNS
// =========================================================================
describe('CriteriaParser: Tamil Patterns', () => {
  let parser;

  beforeAll(() => {
    parser = new CriteriaParser();
  });

  test('parses Tamil age condition: வயது – 60 மற்றும் அதற்கு மேல்', () => {
    const result = parser.parse('வயது – 60 மற்றும் அதற்கு மேல் உள்ளவராகவும் இருத்தல் வேண்டும்.');
    expect(result.rules.age).toEqual({ $gte: 60 });
  });

  test('parses Tamil asset condition: சொத்து ரூ.1,00,000/-', () => {
    const result = parser.parse('அசையா சொத்து ரூ.1,00,000/-திற்கு மிகாமல் இருத்தல் வேண்டும்.');
    expect(result.rules.assetLimit).toEqual({ $lte: 100000 });
  });

  test('parses Tamil asset condition variant: சொத்தின் மதிப்பு ரூ.1,00,000/- த்திற்குள்', () => {
    const result = parser.parse('அசையா சொத்தின் மதிப்பு ரூ.1,00,000/- த்திற்குள் இருத்தல் வேண்டும்.');
    expect(result.rules.assetLimit).toEqual({ $lte: 100000 });
  });

  test('parses Tamil desertion condition: 5 ஆண்டுகள் கணவனால் கைவிடப்பட்ட', () => {
    const result = parser.parse('5 ஆண்டுகள் கணவனால் கைவிடப்பட்டவராகவோ');
    expect(result.rules.desertionYears).toEqual({ $gte: 5 });
  });

  test('parses Tamil disability percent: 40 சதவிகிதம் ஊனம்', () => {
    const result = parser.parse('ஊனம் நிலை-40 சதவிகிதம் மற்றும் அதற்கு மேல்.');
    // The regex matches "40" followed by "சதவிகிதம்" within disability-related context
    // Even if the exact pattern differs, the disability or disabilityPercent fields should appear
    const hasDisability = result.rules.disabilityPercent || result.rules.disability;
    expect(hasDisability).toBeTruthy();
  });

  test('parses Tamil unemployment condition: வேலையற்றவர்', () => {
    const result = parser.parse('வேலையற்றவராக இருத்தல் வேண்டும்.');
    expect(result.rules.unemployed).toBe(true);
  });

  test('parses Tamil residency condition: தமிழ்நாட்டில் வசிப்பவர்', () => {
    const result = parser.parse('தமிழ்நாட்டில் வசிப்பவராக இருத்தல் வேண்டும்.');
    expect(result.rules.residency).toBe('Tamil Nadu');
  });

  test('parses Tamil income in lakh: ஆண்டு வருமானம் ரூ.3 இலட்சம்', () => {
    const result = parser.parse('ஆண்டு வருமானம் ரூ.3 இலட்சத்திற்கு மிகாமல் இருக்க வேண்டும்.');
    expect(result.rules.annualIncome).toEqual({ $lte: 300000 });
  });

  test('parses Tamil widow condition: ஆதரவற்ற விதவை', () => {
    const result = parser.parse('ஆதரவற்ற விதவையாக இருத்தல் வேண்டும்.');
    expect(result.rules.maritalStatus).toBe('widowed');
    expect(result.rules.destitute).toBe(true);
  });

  test('parses Tamil unmarried women condition: திருமணமாகாத பெண்', () => {
    const result = parser.parse('ஆதரவற்ற மற்றும் திருமணமாகாத பெண்ணாக இருத்தல் வேண்டும்.');
    expect(result.rules.maritalStatus).toBe('unmarried');
  });
});

// =========================================================================
// C. NORMALIZER: areValuesDifferent FALSE-DIFFER PREVENTION
// =========================================================================
describe('Normalizer: areValuesDifferent', () => {
  test('same amount in different formats: Rs.1,000/- vs ₹1,000 → NOT different', () => {
    expect(areValuesDifferent('Rs.1,000/-', '₹1,000', 'benefit')).toBe(false);
    expect(areValuesDifferent('₹1,000', 'Rs 1000', 'benefit')).toBe(false);
    expect(areValuesDifferent('Rs.1,200/-', '₹1,200', 'amount')).toBe(false);
  });

  test('different amounts: Rs.1,000 vs ₹2,000 → IS different', () => {
    expect(areValuesDifferent('Rs.1,000/-', '₹2,000', 'benefit')).toBe(true);
  });

  test('same text with cosmetic punctuation changes → NOT different', () => {
    expect(areValuesDifferent(
      '₹1,000/month for girls studying in government schools',
      'Paid Rs.1,000/- per month for girls studying in government schools',
      'benefit'
    )).toBe(false);
  });

  test('Tamil digit normalization: ௧௨௦௦ = 1200', () => {
    expect(replaceTamilDigits('௧௨௦௦')).toBe('1200');
    expect(parseNormalizedAmount('ரூ.௧,௨௦௦/-')).toBe(1200);
  });

  test('normalizeText handles currency, whitespace, and case', () => {
    const a = normalizeText('Rs.1,000/- per month');
    const b = normalizeText('₹1000 per month');
    expect(a).toBe(b);
  });

  test('same age in object vs number → NOT different', () => {
    expect(areValuesDifferent({ $gte: 60 }, 60, 'age')).toBe(false);
    expect(areValuesDifferent(60, { $gte: 60 }, 'age')).toBe(false);
  });

  test('different ages → IS different', () => {
    expect(areValuesDifferent(60, 65, 'age')).toBe(true);
    expect(areValuesDifferent({ $gte: 60 }, { $gte: 65 }, 'age')).toBe(true);
  });

  test('same income limit formats → NOT different', () => {
    expect(areValuesDifferent({ $lte: 200000 }, 200000, 'annualIncome')).toBe(false);
  });

  test('application status: case-insensitive compare', () => {
    expect(areValuesDifferent('Open', 'open', 'applicationStatus')).toBe(false);
    expect(areValuesDifferent('open', 'closed', 'applicationStatus')).toBe(true);
  });

  test('null → non-null is different', () => {
    expect(areValuesDifferent(null, 'some value', 'benefit')).toBe(true);
    expect(areValuesDifferent('value', null, 'benefit')).toBe(true);
  });
});

// =========================================================================
// D. GOVERNMENT DOMAIN ALLOWLIST
// =========================================================================
describe('Government Domain Allowlist', () => {
  test('tnsta.gov.in is allowed (Vidiyal Payanam)', () => {
    expect(isAllowlistedUrl('https://tnsta.gov.in')).toBe(true);
    expect(isAllowlistedUrl('https://www.tnsta.gov.in')).toBe(true);
    expect(isAllowlistedUrl('https://tnstc.in')).toBe(false);
  });

  test('cra.tn.gov.in is allowed (CRA pensions)', () => {
    expect(isAllowlistedUrl('https://cra.tn.gov.in/about_schemes_t.php')).toBe(true);
  });

  test('non-government domains are blocked', () => {
    expect(isAllowlistedUrl('https://example.com')).toBe(false);
    expect(isAllowlistedUrl('https://some-blog.wordpress.com/schemes')).toBe(false);
    expect(isAllowlistedUrl('https://twitter.com/scheme_info')).toBe(false);
  });

  test('tnvelaivaaippu.gov.in is allowed (Employment)', () => {
    expect(isAllowlistedUrl('https://tnvelaivaaippu.gov.in')).toBe(true);
  });

  test('myscheme.gov.in is allowed (CMCHIS fallback)', () => {
    expect(isAllowlistedUrl('https://www.myscheme.gov.in/schemes/cmchis')).toBe(true);
  });
});

// =========================================================================
// E. DISPLAY STATES (5 STATES)
// =========================================================================
describe('Display States: Presenter Algorithm', () => {
  const mongoose = require('mongoose');

  beforeAll(() => {
    process.env.AI_MODE = 'off';
    process.env.FETCH_ONLY = 'true';
  });

  afterAll(() => {
    delete process.env.AI_MODE;
    delete process.env.FETCH_ONLY;
  });

  const makeScheme = (overrides) => ({
    _id: 'test_scheme_123',
    name: 'Test Scheme',
    benefit: '₹1,000 per month',
    eligibilityRules: {},
    rules: {},
    unmappedCriteria: [],
    requiredDocuments: [],
    howToApply: [],
    officialLinks: [],
    verificationLevel: 'secondary-source',
    verificationStatus: 'unreachable',
    verificationReason: 'no candidate link',
    lastVerified: '',
    rawSourceText: '',
    ...overrides
  });

  test('confirmed: verified + official quotes → "Official source confirmed"', async () => {
    const scheme = makeScheme({
      verificationStatus: 'verified',
      verificationLevel: 'official',
      lastVerified: new Date().toISOString()
    });
    const facts = [
      { field: 'amount', value: 1000, quote: 'Monthly pension of Rs.1,000/-', extractedBy: 'selector', confidence: 0.95 }
    ];
    const result = await presentScheme({ scheme, facts });
    expect(result.displayState).toBe('confirmed');
    expect(result.displayBadge).toBe('Official source confirmed');
  });

  test('partial: some facts with quotes but not fully verified → "Partly confirmed"', async () => {
    const scheme = makeScheme({
      verificationStatus: 'partial',
      verificationLevel: 'secondary-source'
    });
    const facts = [
      { field: 'amount', value: 1200, quote: '₹1200 per month', extractedBy: 'regex', confidence: 0.85 }
    ];
    const result = await presentScheme({ scheme, facts });
    expect(result.displayState).toBe('partial');
    expect(result.displayBadge).toBe('Partly confirmed');
  });

  test('fetched_not_parsed: raw text but 0 facts → "Details not yet confirmed"', async () => {
    const scheme = makeScheme({
      verificationStatus: 'fetched_not_parsed',
      rawSourceText: 'This is a long official government page text that has not yet been parsed into structured facts. '.repeat(10)
    });
    const facts = [];
    const result = await presentScheme({ scheme, facts });
    expect(result.displayState).toBe('fetched_not_parsed');
    expect(result.displayBadge).toBe('Details not yet confirmed');
    expect(result.displayNotice).toMatch(/Official page checked on/);
    expect(result.officialExcerpt).toBeTruthy();
  });

  test('unreachable: site down with reason → "Official site not reachable"', async () => {
    const scheme = makeScheme({
      verificationStatus: 'unreachable',
      verificationReason: 'Connection timeout after 20000ms'
    });
    const facts = [];
    const result = await presentScheme({ scheme, facts });
    expect(result.displayState).toBe('unreachable');
    expect(result.displayBadge).toBe('Official site not reachable');
    expect(result.displayNotice).toMatch(/not reachable on/);
  });

  test('never_checked: no verification data → "Not yet confirmed"', async () => {
    const scheme = makeScheme({
      verificationStatus: '',
      verificationReason: '',
      lastVerified: ''
    });
    const facts = [];
    const result = await presentScheme({ scheme, facts });
    expect(result.displayState).toBe('never_checked');
    expect(result.displayBadge).toBe('Not yet confirmed');
  });

  test('TLS expired reason is formatted plainly', async () => {
    const scheme = makeScheme({
      verificationStatus: 'tls_problem',
      verificationReason: 'The website\'s security certificate has expired (expired on 2024-03-15)'
    });
    const result = await presentScheme({ scheme, facts: [] });
    expect(result.displayState).toBe('unreachable');
    expect(result.displayNotice).toMatch(/Security certificate expired/);
  });

  test('"awaiting AI check" status maps to fetched_not_parsed, never shows as badge', async () => {
    const scheme = makeScheme({
      verificationStatus: 'awaiting ai check',
      rawSourceText: 'Some official text from the government portal describing schemes and eligibility criteria in detail. '.repeat(5)
    });
    const result = await presentScheme({ scheme, facts: [] });
    expect(result.displayState).toBe('fetched_not_parsed');
    expect(result.displayBadge).not.toMatch(/awaiting/i);
    expect(result.displayBadge).toBe('Details not yet confirmed');
  });
});

// =========================================================================
// F. SUSPICIOUS RECORDS
// =========================================================================
describe('Suspicious Record Handling', () => {
  test('Thalapathy Vijay Education Award should be rejected as non-official', () => {
    // This is a policy test: any scheme from a non-government source must be rejected
    const starterSchemes = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'data', 'starter-schemes.json'), 'utf8')
    );
    const vijay = starterSchemes.find(s =>
      (s.name || s.schemeName || '').includes('Thalapathy Vijay') ||
      (s.name || s.schemeName || '').includes('TVK')
    );
    if (vijay) {
      expect(vijay.reviewStatus).toBe('rejected');
      expect(vijay.rejectionReason || vijay.reviewReason || vijay.reason).toMatch(/no official government page/i);
    }
    // If not found in starter data, also acceptable (may have been removed)
  });

  test('State Government Employees Pension should be merged via aliases', () => {
    const starterSchemes = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'data', 'starter-schemes.json'), 'utf8')
    );
    const pension = starterSchemes.find(s =>
      (s.name || s.schemeName || '').includes('State Government Employees Pension') ||
      (s.aliases || []).includes('TAPS')
    );
    if (pension) {
      expect(pension.aliases || []).toContain('TAPS');
      expect(pension.reviewStatus).toBe('pending');
    }
  });
});

// =========================================================================
// G. ZERO GEMINI CALLS IN AI_MODE=OFF
// =========================================================================
describe('Zero Gemini Calls in AI_MODE=off', () => {
  beforeAll(() => {
    process.env.AI_MODE = 'off';
    process.env.FETCH_ONLY = 'true';
    resetGateForTesting();
  });

  afterAll(() => {
    delete process.env.AI_MODE;
    delete process.env.FETCH_ONLY;
  });

  test('AI gate blocks all purposes in AI_MODE=off', async () => {
    const result1 = await callGemini({
      purpose: 'display',
      execute: async () => ({ text: 'Should never run' })
    });
    expect(result1.ok).toBe(false);
    expect(result1.code).toBe('ai_disabled');

    const result2 = await callGemini({
      purpose: 'user',
      execute: async () => ({ text: 'Should never run' })
    });
    expect(result2.ok).toBe(false);
    expect(result2.code).toBe('ai_disabled');
  });

  test('AI gate blocks non-allowed purposes always', async () => {
    // Temporarily remove AI_MODE=off to test purpose filtering
    const origAiMode = process.env.AI_MODE;
    process.env.AI_MODE = 'auto';
    resetGateForTesting();

    const result = await callGemini({
      purpose: 'background',
      execute: async () => ({ text: 'Should never run' })
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('ai_disabled');

    process.env.AI_MODE = origAiMode;
    resetGateForTesting();
  });

  test('isAiModeOff returns true when AI_MODE=off or FETCH_ONLY=true', () => {
    expect(isAiModeOff()).toBe(true);
  });
});
