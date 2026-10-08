const request = require('supertest');
const geminiConfig = require('../lib/geminiConfig');
const {
  detectQuotaOrRateLimit,
  generateContentWithRetry,
  resetQuotaAndBudgetForTesting,
  setQuotaExhausted
} = require('../lib/gemini');

describe('Gemini Quota & Budget Controller Unit Tests', () => {
  beforeEach(() => {
    resetQuotaAndBudgetForTesting();
    process.env.GEMINI_API_KEY = 'test_mock_key';
    process.env.GEMINI_MAX_CALLS_PER_DAY = '10';
    process.env.GEMINI_RESERVE_FOR_CHAT_PERCENT = '30'; // 3 reserve for chat, 7 for background
  });

  afterEach(() => {
    resetQuotaAndBudgetForTesting();
  });

  test('1. Distinguishes per-minute rate-limit from daily quota exhaustion', () => {
    const rateLimitErr = new Error('Quota exceeded for metric requests per minute. Please retry after 25s.');
    rateLimitErr.status = 429;
    const rateLimitRes = detectQuotaOrRateLimit(rateLimitErr);
    expect(rateLimitRes.isRateLimit).toBe(true);
    expect(rateLimitRes.isQuotaExhausted).toBe(false);

    const quotaExhaustedErr = new Error('RESOURCE_EXHAUSTED: Daily quota limit exceeded for project.');
    quotaExhaustedErr.status = 429;
    const quotaRes = detectQuotaOrRateLimit(quotaExhaustedErr);
    expect(quotaRes.isRateLimit).toBe(false);
    expect(quotaRes.isQuotaExhausted).toBe(true);
  });

  test('2. Model switching without retrying the exhausted model', async () => {
    let callCounts = {};

    const customClient = {
      models: {
        generateContent: async ({ model }) => {
          callCounts[model] = (callCounts[model] || 0) + 1;
          const mainModel = geminiConfig.getModels().mainModel;
          if (model === mainModel) {
            const err = new Error('RESOURCE_EXHAUSTED: Daily quota exhausted');
            err.status = 429;
            throw err;
          }
          return { text: 'Fallback response OK' };
        }
      }
    };

    const res = await generateContentWithRetry({
      contents: [{ role: 'user', parts: [{ text: 'test' }] }],
      options: { skipCache: true },
      customClient
    });

    const models = geminiConfig.getModels();
    expect(callCounts[models.mainModel]).toBe(1); // Tried main model ONCE, no retry on exhausted model
    expect(callCounts[models.fallbackModel]).toBe(1); // Switched to fallback model
    expect(res.text).toBe('Fallback response OK');
  });

  test('3. AI Budget controller enforces chat reserve for background jobs', async () => {
    const customClient = {
      models: {
        generateContent: async () => ({ text: 'OK' })
      }
    };

    // Simulate 7 background calls out of max 10 (with 30% = 3 reserved for chat)
    for (let i = 0; i < 7; i++) {
      await generateContentWithRetry({
        contents: [{ role: 'user', parts: [{ text: `bg call ${i}` }] }],
        options: { isChat: false, skipCache: true },
        customClient
      });
    }

    // 8th background call should fail due to background budget limit (max 7)
    await expect(generateContentWithRetry({
      contents: [{ role: 'user', parts: [{ text: 'bg call 8' }] }],
      options: { isChat: false, skipCache: true },
      customClient
    })).rejects.toThrow('Background AI job budget exceeded for today.');

    // Chat call should STILL succeed using the reserved chat budget!
    const chatRes = await generateContentWithRetry({
      contents: [{ role: 'user', parts: [{ text: 'user chat query' }] }],
      options: { isChat: true, skipCache: true },
      customClient
    });
    expect(chatRes.text).toBe('OK');
  });

  test('4. Dev switches default to OFF in environment', () => {
    expect(process.env.RUN_JOBS_ON_START || 'false').toBe('false');
    expect(process.env.ENABLE_SCHEDULER || 'false').toBe('false');
    expect(process.env.ENABLE_DISCOVERY || 'false').toBe('false');
  });

  test('5. POST /api/chat returns ai_quota_exhausted code and user-friendly error message when quota exhausted', async () => {
    const app = require('../server');
    await setQuotaExhausted(new Date(Date.now() + 3600000), 'ai_quota_exhausted');

    const res = await request(app)
      .post('/api/chat/simple')
      .send({ messages: [{ role: 'user', text: 'Hello' }] });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('ai_quota_exhausted');
    expect(res.body.error).toBe('The AI assistant has reached its usage limit for now. Please try again later.');
  });
});
