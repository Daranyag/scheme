require('dotenv').config();
const { resolveModels, getModels } = require('../lib/geminiConfig');
const {
  generateContentWithRetry,
  getQuotaAndBudgetStatus,
  detectQuotaOrRateLimit
} = require('../lib/gemini');

async function runCheck() {
  console.log('====================================================');
  console.log('            GEMINI BACKEND HEALTH CHECK             ');
  console.log('====================================================\n');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.error('FAIL: GEMINI_API_KEY is missing in environment!');
    process.exit(1);
  }

  const quotaStatus = await getQuotaAndBudgetStatus();
  console.log('Current Quota & Budget State:');
  console.log(` - Daily Call Cap:          ${quotaStatus.dailyCap}`);
  console.log(` - Calls Used Today:        ${quotaStatus.callsUsedToday} (Chat: ${quotaStatus.chatCalls}, Background: ${quotaStatus.backgroundCalls})`);
  console.log(` - Reserved Chat Share:     ${quotaStatus.reservedChatPercent}% (${quotaStatus.reservedChat} calls)`);
  console.log(` - Max Background Calls:    ${quotaStatus.maxBackgroundCalls}`);
  console.log(` - Quota Exhausted Until:   ${quotaStatus.quotaExhaustedUntil ? quotaStatus.quotaExhaustedUntil.toISOString() : 'None (Active)'}`);
  console.log(` - Last Error Code:         ${quotaStatus.lastErrorCode || 'None'}`);

  console.log('\nModels Configuration:');
  console.log(` - Main Model:      ${quotaStatus.models.mainModel}`);
  console.log(` - Fallback Model:  ${quotaStatus.models.fallbackModel}`);
  console.log(` - Grounding Model: ${quotaStatus.models.groundingModel}`);
  console.log('\n----------------------------------------------------\n');

  console.log('Executing single tiny test call...');
  try {
    const res = await generateContentWithRetry({
      contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
      options: { skipCache: true },
      customDelays: [100, 200]
    });

    console.log(`Result: PASS [Model: ${res.modelUsed}]`);
    console.log(`Response text: "${(res.text || '').trim()}"`);
    process.exit(0);
  } catch (err) {
    const { isRateLimit, isQuotaExhausted, retryDelayMs } = detectQuotaOrRateLimit(err);
    if (isQuotaExhausted || err.code === 'ai_quota_exhausted') {
      const nextRetry = quotaStatus.quotaExhaustedUntil ? quotaStatus.quotaExhaustedUntil.toISOString() : new Date(Date.now() + 3600000).toISOString();
      console.log(`Result: 429 quota exhausted`);
      console.log(`Next retry time: ${nextRetry}`);
      console.log(`Details: ${err.message}`);
    } else if (isRateLimit) {
      const retrySecs = Math.ceil((retryDelayMs || 30000) / 1000);
      const nextRetry = new Date(Date.now() + (retryDelayMs || 30000)).toISOString();
      console.log(`Result: 429 per-minute`);
      console.log(`Retry delay: ${retrySecs} seconds`);
      console.log(`Next retry time: ${nextRetry}`);
      console.log(`Details: ${err.message}`);
    } else {
      console.log(`Result: error (${err.code || err.status || 'unknown'}) - ${err.message}`);
    }
    process.exit(1);
  }
}

runCheck().catch((err) => {
  console.error('Fatal check error:', err.message || err);
  process.exit(1);
});
