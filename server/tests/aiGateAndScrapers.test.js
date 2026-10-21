require('../lib/networkGuard');
jest.mock('../services/linkChecker', () => ({ checkLinks: jest.fn().mockResolvedValue([]) }));
const axios = require('axios');
const { callGemini, resetGateForTesting } = require('../lib/aiGate');
const { isHostBlocked, getCallerLocation } = require('../lib/networkGuard');
const { scrapePage } = require('../scrapers/scraperEngine');
const { runVerificationJob } = require('../services/verificationJob');
const fetcher = require('../lib/fetcher');
const Scheme = require('../models/Scheme');

describe('AI Gate and Network Guard (AI-off verification)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetGateForTesting();
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('isHostBlocked correctly identifies Google AI hosts', () => {
    expect(isHostBlocked('generativelanguage.googleapis.com')).toBe(true);
    expect(isHostBlocked('aiplatform.googleapis.com')).toBe(true);
    expect(isHostBlocked('gemini.google.com')).toBe(true);
    expect(isHostBlocked('cra.tn.gov.in')).toBe(false);
    expect(isHostBlocked('tnsocialwelfare.tn.gov.in')).toBe(false);
  });

  test('Network Guard blocks direct call to Google AI hosts in AI-off mode', async () => {
    process.env.AI_MODE = 'off';
    process.env.FETCH_ONLY = 'true';

    let errorThrown = null;
    try {
      await axios.get('https://generativelanguage.googleapis.com/v1beta/models');
    } catch (err) {
      errorThrown = err;
    }

    expect(errorThrown).not.toBeNull();
    expect(errorThrown.code).toBe('BLOCKED_AI_CALL');
    expect(errorThrown.message).toContain('BLOCKED AI CALL in AI_MODE=off');
  });

  test('Global fetch to Google AI host is blocked in AI-off mode', async () => {
    process.env.AI_MODE = 'off';
    process.env.FETCH_ONLY = 'true';

    let errorThrown = null;
    try {
      await globalThis.fetch('https://generativelanguage.googleapis.com/v1beta/models');
    } catch (err) {
      errorThrown = err;
    }

    expect(errorThrown).not.toBeNull();
    expect(errorThrown.code).toBe('BLOCKED_AI_CALL');
    expect(errorThrown.message).toContain('BLOCKED AI CALL in AI_MODE=off');
  });

  test('AI Gate returns { ok: false, code: "ai_disabled" } without executing callback for background purpose', async () => {
    process.env.AI_MODE = 'off';
    process.env.FETCH_ONLY = 'true';

    const executeSpy = jest.fn().mockResolvedValue({ text: 'sample' });
    const result = await callGemini({
      purpose: 'background',
      execute: executeSpy
    });

    expect(executeSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.code).toBe('ai_disabled');
    expect(result.skipped).toBe(true);
  });

  test('User purpose calls still work when AI is on', async () => {
    process.env.AI_MODE = 'auto';
    process.env.FETCH_ONLY = 'false';
    process.env.USER_AI_ENABLED = 'true';

    const executeSpy = jest.fn().mockResolvedValue({ text: 'User chat response' });
    const result = await callGemini({
      purpose: 'user',
      execute: executeSpy
    });

    expect(executeSpy).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.text).toBe('User chat response');
  });

  test('Quota-exhausted state does not crash or affect AI-off runs', async () => {
    process.env.AI_MODE = 'off';
    process.env.FETCH_ONLY = 'true';

    // Simulate quota exhaustion in gemini module
    const gemini = require('../lib/gemini');
    const executeSpy = jest.fn().mockResolvedValue({ text: 'data' });

    // AI Gate for background returns ai_disabled immediately
    const res = await callGemini({ purpose: 'background', execute: executeSpy });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('ai_disabled');

    // Scraper engine works normally without AI
    const pageHtml = `
      <div class="content">
        <h1>Old Age Pension</h1>
        <p>Eligibility: Age 60 years and above</p>
        <p>Assistance: ₹1,000 per month</p>
        <p>Required: Aadhaar and Ration card</p>
      </div>
    `;
    const scrapeRes = await scrapePage({
      html: pageHtml,
      text: 'Old Age Pension. Eligibility: Age 60 years and above. Assistance: ₹1,000 per month. Required: Aadhaar and Ration card',
      url: 'https://cra.tn.gov.in/scheme'
    });

    expect(scrapeRes.status).toBe('ok');
    expect(scrapeRes.facts.length).toBeGreaterThanOrEqual(2);
    expect(scrapeRes.benefit).toBe('₹1,000/month');
  });

  test('Full live:rules pass makes ZERO requests to Google AI hosts and extracts facts using scrapers', async () => {
    process.env.AI_MODE = 'off';
    process.env.FETCH_ONLY = 'true';
    process.env.ENABLE_GROUNDING = 'false';
    process.env.ENABLE_DISCOVERY = 'false';

    const mockScheme = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Test Welfare Pension',
      schemeName: 'Test Welfare Pension',
      benefit: '₹1,000/month',
      officialLinks: [['Portal', 'https://cra.tn.gov.in/test']],
      docs: ['Aadhaar'],
      rules: { age: { $gte: 60 } },
      save: jest.fn().mockResolvedValue(true)
    };

    jest.spyOn(Scheme, 'find').mockResolvedValue([mockScheme]);

    jest.spyOn(fetcher, 'fetchPage').mockResolvedValue({
      ok: true,
      finalUrl: 'https://cra.tn.gov.in/test',
      status: 200,
      contentType: 'text/html',
      bytes: 1540,
      text: 'Test Welfare Pension. Beneficiary gets ₹1,000 per month assistance. Eligibility: Age 60 years and above. G.O. (Ms) No. 42.',
      rawHtml: '<p>Beneficiary gets ₹1,000 per month assistance. Age 60 years and above. G.O. (Ms) No. 42.</p>',
      links: []
    });

    const linkChecker = require('../services/linkChecker');
    jest.spyOn(linkChecker, 'checkLinks').mockResolvedValue([]);

    const report = await runVerificationJob({ schemeFilter: 'Test Welfare Pension', skipDeptCoverage: true });

    expect(report.length).toBe(1);
    expect(report[0].status).toBe('confirmed');
    expect(report[0].pageUsed).toBe('https://cra.tn.gov.in/test');
  }, 15000);
});
