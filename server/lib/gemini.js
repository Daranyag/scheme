const crypto = require('crypto');
const mongoose = require('mongoose');
const { GoogleGenAI } = require('@google/genai');
const { z } = require('zod');
const geminiConfig = require('./geminiConfig');
const AiUsage = require('../models/AiUsage');
const AiCache = require('../models/AiCache');

// In-memory state
let inMemoryQuotaExhaustedUntil = null;
let inMemoryLastErrorCode = null;
let loggedBackgroundBudgetExhausted = false;
let inMemoryDailyDate = getTodayDateString();
let inMemoryTotalCalls = 0;
let inMemoryChatCalls = 0;
let inMemoryBackgroundCalls = 0;

function checkResetInMemoryCounts() {
  const today = getTodayDateString();
  if (today !== inMemoryDailyDate) {
    inMemoryDailyDate = today;
    inMemoryTotalCalls = 0;
    inMemoryChatCalls = 0;
    inMemoryBackgroundCalls = 0;
    loggedBackgroundBudgetExhausted = false;
  }
}

function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}

function parseRetryDelayMs(err) {
  const msg = err.message || String(err);
  if (err.errorDetails && Array.isArray(err.errorDetails)) {
    for (const detail of err.errorDetails) {
      if (detail.retryDelay) {
        const secs = parseFloat(detail.retryDelay);
        if (!isNaN(secs)) return secs * 1000;
      }
    }
  }
  const match = msg.match(/retry after (\d+(\.\d+)?)s/i) || msg.match(/wait (\d+(\.\d+)?)s/i) || msg.match(/in (\d+(\.\d+)?)s/i);
  if (match) {
    return parseFloat(match[1]) * 1000;
  }
  return null;
}

function detectQuotaOrRateLimit(err) {
  const status = err.status || err.code || err.statusCode;
  const msg = (err.message || String(err)).toLowerCase();

  const is429 = status === 429 || msg.includes('resource_exhausted') || msg.includes('rate limit') || msg.includes('quota');
  if (!is429) {
    return { isRateLimit: false, isQuotaExhausted: false, retryDelayMs: null };
  }

  const delayMs = parseRetryDelayMs(err);

  // Per-minute rate limit detection
  if ((delayMs !== null && delayMs <= 120000) || msg.includes('per minute') || msg.includes('rpm') || msg.includes('tpm') || msg.includes('requests per minute')) {
    return {
      isRateLimit: true,
      isQuotaExhausted: false,
      retryDelayMs: delayMs || 30000
    };
  }

  // Quota exhausted (per day or plan limit)
  return {
    isRateLimit: false,
    isQuotaExhausted: true,
    retryDelayMs: null
  };
}

function getQuotaExhaustedUntilTime() {
  const now = new Date();
  return new Date(now.getTime() + 3600000); // 1 hour window
}

async function getQuotaAndBudgetStatus() {
  checkResetInMemoryCounts();
  const today = getTodayDateString();
  const dailyCap = parseInt(process.env.GEMINI_MAX_CALLS_PER_DAY || '200', 10);
  const reservePercent = parseInt(process.env.GEMINI_RESERVE_FOR_CHAT_PERCENT || '30', 10);
  const reservedChat = Math.floor(dailyCap * (reservePercent / 100));
  const maxBackgroundCalls = dailyCap - reservedChat;

  let usage = null;
  if (mongoose.connection.readyState === 1) {
    try {
      usage = await AiUsage.findOne({ date: today }).lean();
    } catch (e) {}
  }

  const totalCalls = usage ? usage.totalCalls : inMemoryTotalCalls;
  const chatCalls = usage ? usage.chatCalls : inMemoryChatCalls;
  const backgroundCalls = usage ? usage.backgroundCalls : inMemoryBackgroundCalls;
  const dbQuotaUntil = usage?.quotaExhaustedUntil ? new Date(usage.quotaExhaustedUntil) : null;
  const quotaExhaustedUntil = (dbQuotaUntil && dbQuotaUntil > new Date()) ? dbQuotaUntil : inMemoryQuotaExhaustedUntil;
  const lastErrorCode = usage?.lastErrorCode || inMemoryLastErrorCode;

  return {
    models: geminiConfig.getModels(),
    callsUsedToday: totalCalls,
    chatCalls,
    backgroundCalls,
    dailyCap,
    reservedChatPercent: reservePercent,
    reservedChat,
    maxBackgroundCalls,
    quotaExhaustedUntil: (quotaExhaustedUntil && quotaExhaustedUntil > new Date()) ? quotaExhaustedUntil : null,
    lastErrorCode
  };
}

async function setQuotaExhausted(untilTime, errorCode = 'ai_quota_exhausted') {
  inMemoryQuotaExhaustedUntil = untilTime;
  inMemoryLastErrorCode = errorCode;

  if (mongoose.connection.readyState === 1) {
    try {
      const today = getTodayDateString();
      await AiUsage.findOneAndUpdate(
        { date: today },
        { quotaExhaustedUntil: untilTime, lastErrorCode: errorCode },
        { upsert: true }
      );
    } catch (e) {}
  }
}

async function recordCallUsage(isChat = false) {
  checkResetInMemoryCounts();
  inMemoryTotalCalls++;
  if (isChat) {
    inMemoryChatCalls++;
  } else {
    inMemoryBackgroundCalls++;
  }

  const today = getTodayDateString();
  if (mongoose.connection.readyState === 1) {
    try {
      const update = { $inc: { totalCalls: 1 } };
      if (isChat) {
        update.$inc.chatCalls = 1;
      } else {
        update.$inc.backgroundCalls = 1;
      }
      await AiUsage.findOneAndUpdate({ date: today }, update, { upsert: true });
    } catch (e) {}
  }
}

function calculatePromptHash(contents, systemInstruction, config) {
  const payloadStr = JSON.stringify({ contents, systemInstruction, config });
  return crypto.createHash('sha256').update(payloadStr).digest('hex');
}

async function getCachedResponse(promptHash) {
  if (mongoose.connection.readyState === 1) {
    try {
      const cached = await AiCache.findOne({ promptHash, expiresAt: { $gt: new Date() } }).lean();
      if (cached) {
        return cached.response;
      }
    } catch (e) {}
  }
  return null;
}

async function setCachedResponse(promptHash, response, modelUsed) {
  if (mongoose.connection.readyState === 1) {
    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await AiCache.findOneAndUpdate(
        { promptHash },
        { response, modelUsed, expiresAt },
        { upsert: true }
      );
    } catch (e) {}
  }
}

// Zod extraction schema
const ExtractionResultSchema = z.object({
  benefit: z.string().nullable().optional(),
  docs: z.array(z.string()).optional(),
  steps: z.array(z.string()).optional(),
  quote: z.string().nullable().optional()
});

function verifyQuoteInPageText(quote, pageText) {
  if (!quote || typeof quote !== 'string' || quote.trim().length === 0) return false;
  if (!pageText || typeof pageText !== 'string') return false;

  const normalizedQuote = quote.toLowerCase().replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizedPage = pageText.toLowerCase().replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

  if (normalizedPage.includes(normalizedQuote)) return true;

  if (normalizedQuote.length >= 12) {
    const snippet = normalizedQuote.substring(0, Math.min(normalizedQuote.length, 30));
    if (normalizedPage.includes(snippet)) return true;
  }

  return false;
}

function mapGeminiErrorCode(err) {
  const status = err.status || err.code || err.statusCode || 500;
  const msg = (err.message || String(err)).toLowerCase();

  if (err.code === 'ai_quota_exhausted' || err.code === 'ai_budget_exceeded') {
    return { code: err.code, status: 429, message: err.message || 'The AI assistant has reached its usage limit for now. Please try again later.' };
  }
  if (status === 401 || status === 403 || msg.includes('api_key') || msg.includes('unauthorized') || msg.includes('invalid key')) {
    return { code: 'ai_key_invalid', status: 401, message: 'The AI service is not set up correctly. Check GEMINI_API_KEY.' };
  }
  if (status === 404 || msg.includes('not found') || msg.includes('no longer available') || msg.includes('does not exist')) {
    return { code: 'ai_model_not_found', status: 404, message: 'The AI model name is wrong or no longer available.' };
  }
  if (status === 429 || msg.includes('rate limit') || msg.includes('quota') || msg.includes('resource_exhausted')) {
    return { code: 'ai_quota_exhausted', status: 429, message: 'The AI assistant has reached its usage limit for now. Please try again later.' };
  }
  if (status === 503 || msg.includes('unavailable') || msg.includes('high demand') || msg.includes('overloaded')) {
    return { code: 'ai_busy', status: 503, message: 'The AI service is busy right now. Spikes in demand are temporary.' };
  }
  if (status === 400 || msg.includes('bad request')) {
    return { code: 'bad_request', status: 400, message: 'Bad request payload to AI service.' };
  }
  return { code: 'internal_error', status: status >= 400 && status < 600 ? status : 500, message: err.message || 'Internal AI service error.' };
}

function sleepMs(ms) {
  if (process.env.NODE_ENV === 'test') {
    return new Promise((resolve) => setTimeout(resolve, 10));
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleepWithJitter(attempt, customDelays) {
  if (process.env.NODE_ENV === 'test') {
    return new Promise((resolve) => setTimeout(resolve, 10));
  }
  const baseDelays = customDelays || [2000, 5000, 15000];
  const base = baseDelays[Math.min(attempt, baseDelays.length - 1)];
  const jitter = Math.floor(Math.random() * 500);
  return new Promise((resolve) => setTimeout(resolve, base + jitter));
}

function getModelsToTry(options = {}) {
  if (options.model) {
    return [options.model];
  }
  const models = geminiConfig.getModels();
  const list = [models.mainModel, models.fallbackModel, models.autoSelectedModel].filter(Boolean);
  return Array.from(new Set(list));
}

async function callGenerateContent(client, modelName, contents, config) {
  if (client.models && typeof client.models.generateContent === 'function') {
    try {
      return await client.models.generateContent({
        model: modelName,
        contents,
        config
      });
    } catch (err) {
      if (err.message && err.message.includes('not supported') && client.interactions) {
        return await client.interactions.create({
          model: modelName,
          input: contents,
          config
        });
      }
      throw err;
    }
  } else if (client.interactions && typeof client.interactions.create === 'function') {
    return await client.interactions.create({
      model: modelName,
      input: contents,
      config
    });
  } else {
    throw new Error('No valid Gemini generation API found on client');
  }
}

async function callGenerateContentStream(client, modelName, contents, config) {
  if (client.models && typeof client.models.generateContentStream === 'function') {
    try {
      return await client.models.generateContentStream({
        model: modelName,
        contents,
        config
      });
    } catch (err) {
      if (err.message && err.message.includes('not supported') && client.interactions) {
        return await client.interactions.createStream({
          model: modelName,
          input: contents,
          config
        });
      }
      throw err;
    }
  } else if (client.interactions && typeof client.interactions.createStream === 'function') {
    return await client.interactions.createStream({
      model: modelName,
      input: contents,
      config
    });
  } else {
    throw new Error('No valid Gemini streaming API found on client');
  }
}

async function generateContentWithRetry({ contents, systemInstruction, config = {}, options = {}, customClient, customDelays }) {
  // Check active quota exhaustion
  const status = await getQuotaAndBudgetStatus();
  if (status.quotaExhaustedUntil && new Date() < status.quotaExhaustedUntil) {
    const err = new Error('The AI assistant has reached its usage limit for now. Please try again later.');
    err.code = 'ai_quota_exhausted';
    err.status = 429;
    throw err;
  }

  // Check daily budget
  const isChat = options.isChat === true;
  if (isChat) {
    if (status.callsUsedToday >= status.dailyCap) {
      const err = new Error('The AI assistant has reached its usage limit for now. Please try again later.');
      err.code = 'ai_quota_exhausted';
      err.status = 429;
      throw err;
    }
  } else {
    if (status.backgroundCalls >= status.maxBackgroundCalls || status.callsUsedToday >= status.dailyCap) {
      if (!loggedBackgroundBudgetExhausted) {
        console.log(`[AI Budget] Background call budget reached (${status.backgroundCalls}/${status.maxBackgroundCalls}). Background jobs paused until tomorrow.`);
        loggedBackgroundBudgetExhausted = true;
      }
      const err = new Error('Background AI job budget exceeded for today.');
      err.code = 'ai_budget_exceeded';
      err.status = 429;
      throw err;
    }
  }

  // Prompt Caching
  const promptHash = calculatePromptHash(contents, systemInstruction, config);
  if (!options.skipCache) {
    const cached = await getCachedResponse(promptHash);
    if (cached) {
      return cached;
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if ((!apiKey || apiKey.trim().length === 0) && !customClient) {
    const err = new Error('GEMINI_API_KEY missing');
    err.status = 401;
    throw err;
  }

  const ai = customClient || new GoogleGenAI({ apiKey: (apiKey || '').trim() });
  const modelsToTry = getModelsToTry(options);
  let lastError = null;
  let allModelsExhaustedQuota = true;

  const reqConfig = { ...config };
  if (systemInstruction && !reqConfig.systemInstruction) {
    reqConfig.systemInstruction = systemInstruction;
  }

  if (reqConfig.tools && reqConfig.tools.some(t => t.googleSearch)) {
    const models = geminiConfig.getModels();
    if (!models.isGroundingSupported) {
      reqConfig.tools = reqConfig.tools.filter(t => !t.googleSearch);
      if (reqConfig.tools.length === 0) delete reqConfig.tools;
    }
  }

  for (const modelName of modelsToTry) {
    let perMinuteRetries = 0;

    while (perMinuteRetries < 4) {
      try {
        const response = await callGenerateContent(ai, modelName, contents, reqConfig);
        const result = {
          text: response.text || '',
          response,
          modelUsed: modelName,
          candidates: response.candidates || []
        };

        await recordCallUsage(isChat);
        if (!options.skipCache) {
          await setCachedResponse(promptHash, result, modelName);
        }
        return result;
      } catch (err) {
        lastError = err;
        const errStatus = err.status || err.code || err.statusCode || 500;
        const msg = (err.message || String(err)).toLowerCase();
        const is404 = errStatus === 404 || msg.includes('not found') || msg.includes('not_found') || msg.includes('does not exist') || msg.includes('no longer available');

        const { isRateLimit, isQuotaExhausted, retryDelayMs } = detectQuotaOrRateLimit(err);

        console.warn(`[Gemini] Model ${modelName} failed: (${errStatus}) ${err.message || err}`);

        if (is404) {
          allModelsExhaustedQuota = false;
          break; // Switch to fallback model immediately
        }

        if (isQuotaExhausted) {
          // Do NOT retry the same model! Switch immediately to fallback model.
          break;
        }

        if (isRateLimit && perMinuteRetries < 2) {
          perMinuteRetries++;
          allModelsExhaustedQuota = false;
          await sleepMs(retryDelayMs || 30000);
          continue;
        }

        // Network or 503 error
        if ((errStatus === 503 || errStatus === 500) && perMinuteRetries < 3) {
          perMinuteRetries++;
          allModelsExhaustedQuota = false;
          await sleepWithJitter(perMinuteRetries, customDelays);
          continue;
        }

        allModelsExhaustedQuota = false;
        break;
      }
    }
  }

  if (allModelsExhaustedQuota && lastError) {
    const until = getQuotaExhaustedUntilTime();
    await setQuotaExhausted(until, 'ai_quota_exhausted');
  }

  throw lastError || new Error('All Gemini model attempts failed');
}

async function generateContentStreamWithRetry({ contents, systemInstruction, config = {}, options = {}, customClient, customDelays }) {
  const status = await getQuotaAndBudgetStatus();
  if (status.quotaExhaustedUntil && new Date() < status.quotaExhaustedUntil) {
    const err = new Error('The AI assistant has reached its usage limit for now. Please try again later.');
    err.code = 'ai_quota_exhausted';
    err.status = 429;
    throw err;
  }

  const isChat = options.isChat === true;
  if (isChat) {
    if (status.callsUsedToday >= status.dailyCap) {
      const err = new Error('The AI assistant has reached its usage limit for now. Please try again later.');
      err.code = 'ai_quota_exhausted';
      err.status = 429;
      throw err;
    }
  } else {
    if (status.backgroundCalls >= status.maxBackgroundCalls || status.callsUsedToday >= status.dailyCap) {
      if (!loggedBackgroundBudgetExhausted) {
        console.log(`[AI Budget] Background call budget reached (${status.backgroundCalls}/${status.maxBackgroundCalls}). Background jobs paused until tomorrow.`);
        loggedBackgroundBudgetExhausted = true;
      }
      const err = new Error('Background AI job budget exceeded for today.');
      err.code = 'ai_budget_exceeded';
      err.status = 429;
      throw err;
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if ((!apiKey || apiKey.trim().length === 0) && !customClient) {
    const err = new Error('GEMINI_API_KEY missing');
    err.status = 401;
    throw err;
  }

  const ai = customClient || new GoogleGenAI({ apiKey: (apiKey || '').trim() });
  const modelsToTry = getModelsToTry(options);
  let lastError = null;
  let allModelsExhaustedQuota = true;

  const reqConfig = { ...config };
  if (systemInstruction && !reqConfig.systemInstruction) {
    reqConfig.systemInstruction = systemInstruction;
  }

  for (const modelName of modelsToTry) {
    let perMinuteRetries = 0;

    while (perMinuteRetries < 3) {
      try {
        const stream = await callGenerateContentStream(ai, modelName, contents, reqConfig);
        await recordCallUsage(isChat);
        return {
          stream,
          modelUsed: modelName
        };
      } catch (err) {
        lastError = err;
        const errStatus = err.status || err.code || err.statusCode || 500;
        const msg = (err.message || String(err)).toLowerCase();
        const is404 = errStatus === 404 || msg.includes('not found') || msg.includes('not_found') || msg.includes('does not exist') || msg.includes('no longer available');

        const { isRateLimit, isQuotaExhausted, retryDelayMs } = detectQuotaOrRateLimit(err);

        console.warn(`[Gemini Stream] Model ${modelName} failed: (${errStatus}) ${err.message || err}`);

        if (is404) {
          allModelsExhaustedQuota = false;
          break;
        }

        if (isQuotaExhausted) {
          break;
        }

        if (isRateLimit && perMinuteRetries < 2) {
          perMinuteRetries++;
          allModelsExhaustedQuota = false;
          await sleepMs(retryDelayMs || 30000);
          continue;
        }

        if ((errStatus === 503 || errStatus === 500) && perMinuteRetries < 2) {
          perMinuteRetries++;
          allModelsExhaustedQuota = false;
          await sleepWithJitter(perMinuteRetries, customDelays);
          continue;
        }

        allModelsExhaustedQuota = false;
        break;
      }
    }
  }

  if (allModelsExhaustedQuota && lastError) {
    const until = getQuotaExhaustedUntilTime();
    await setQuotaExhausted(until, 'ai_quota_exhausted');
  }

  throw lastError || new Error('All Gemini stream model attempts failed');
}

async function runGroundedSearch({ prompt, contents, customClient, options = {} }) {
  const models = geminiConfig.getModels();
  if (!models.isGroundingSupported) {
    return { text: '', candidates: [], modelUsed: models.groundingModel, skipped: true };
  }

  const queryContents = contents || prompt;
  const config = {
    tools: [{ googleSearch: {} }]
  };

  return await generateContentWithRetry({
    contents: queryContents,
    config,
    options: { model: models.groundingModel, ...options },
    customClient
  });
}

async function extractSchemeInformation(schemeName, pageText, options = {}) {
  if (!pageText || pageText.trim().length === 0) {
    return { ok: false, errorType: 'empty_content', data: null };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey && !options.customClient) {
    return { ok: false, errorType: 'ai_unavailable', data: null };
  }

  if (pageText.length > 30000 && !options.isChunk) {
    return await processInChunks(schemeName, pageText, options);
  }

  const prompt = `
  Extract scheme information strictly from the fetched text below for scheme: "${schemeName}".
  Do NOT hallucinate or invent data outside this text.

  Fetched Official Text:
  ${pageText.substring(0, 25000)}

  Return JSON strictly in this format:
  {
    "benefit": "benefit text or null",
    "docs": ["document 1", "document 2"],
    "steps": ["step 1"],
    "quote": "short exact quote from text supporting benefit"
  }
  `;

  try {
    const res = await generateContentWithRetry({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json' },
      options,
      customClient: options.customClient,
      customDelays: options.customDelays
    });

    let parsed = null;
    try {
      parsed = JSON.parse(res.text);
    } catch (jsonErr) {
      const retryPrompt = prompt + `\n\nPrevious output had JSON parse error: ${jsonErr.message}. Output valid JSON strictly matching schema.`;
      const retryRes = await generateContentWithRetry({
        contents: [{ role: 'user', parts: [{ text: retryPrompt }] }],
        config: { responseMimeType: 'application/json' },
        options,
        customClient: options.customClient,
        customDelays: options.customDelays
      });
      parsed = JSON.parse(retryRes.text);
    }

    const validationResult = ExtractionResultSchema.safeParse(parsed);
    if (!validationResult.success) {
      return { ok: false, errorType: 'parse_error', data: null };
    }

    const data = validationResult.data;

    if (data.benefit) {
      const hasValidQuote = verifyQuoteInPageText(data.quote, pageText) || verifyQuoteInPageText(data.benefit, pageText);
      if (!hasValidQuote) {
        data.benefit = null;
        data.quote = null;
      }
    }

    return {
      ok: true,
      errorType: null,
      data: {
        benefit: data.benefit || null,
        docs: Array.isArray(data.docs) ? data.docs : [],
        steps: Array.isArray(data.steps) ? data.steps : [],
        quote: data.quote || null
      },
      modelUsed: res.modelUsed
    };
  } catch (err) {
    const mapped = mapGeminiErrorCode(err);
    return { ok: false, errorType: mapped.code === 'ai_quota_exhausted' ? 'ai_quota_exhausted' : 'ai_unavailable', data: null };
  }
}

async function processInChunks(schemeName, pageText, options) {
  const chunkSize = 25000;
  const overlap = 1000;
  const chunks = [];

  for (let i = 0; i < pageText.length; i += (chunkSize - overlap)) {
    chunks.push(pageText.substring(i, i + chunkSize));
  }

  let mergedBenefit = null;
  let mergedQuote = null;
  const docsSet = new Set();
  const stepsSet = new Set();

  for (const chunk of chunks) {
    const res = await extractSchemeInformation(schemeName, chunk, { ...options, isChunk: true });
    if (res.ok && res.data) {
      if (!mergedBenefit && res.data.benefit) {
        mergedBenefit = res.data.benefit;
        mergedQuote = res.data.quote;
      }
      (res.data.docs || []).forEach(d => docsSet.add(d));
      (res.data.steps || []).forEach(s => stepsSet.add(s));
    }
  }

  return {
    ok: true,
    errorType: null,
    data: {
      benefit: mergedBenefit,
      docs: Array.from(docsSet),
      steps: Array.from(stepsSet),
      quote: mergedQuote
    }
  };
}

function resetQuotaAndBudgetForTesting() {
  inMemoryQuotaExhaustedUntil = null;
  inMemoryLastErrorCode = null;
  loggedBackgroundBudgetExhausted = false;
  inMemoryDailyDate = getTodayDateString();
  inMemoryTotalCalls = 0;
  inMemoryChatCalls = 0;
  inMemoryBackgroundCalls = 0;
}

module.exports = {
  generateContentWithRetry,
  generateContentStreamWithRetry,
  runGroundedSearch,
  extractSchemeInformation,
  verifyQuoteInPageText,
  mapGeminiErrorCode,
  detectQuotaOrRateLimit,
  getQuotaAndBudgetStatus,
  setQuotaExhausted,
  resetQuotaAndBudgetForTesting
};
