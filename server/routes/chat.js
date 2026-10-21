const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const Scheme = require('../models/Scheme');
const {
  generateContentStreamWithRetry,
  generateContentWithRetry,
  mapGeminiErrorCode,
} = require('../services/geminiService');

// Rate Limiter: at least 30 requests per minute per client
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.setHeader('Retry-After', '5');
    res.status(429).json({
      code: 'rate_limited',
      error: 'Too many messages. Please wait a few seconds.',
    });
  },
});

router.use(chatLimiter);

/**
 * Shared helper to build system prompt and contents history
 */
async function buildChatContext({ message, messages = [], profile = {}, eligibleSchemes = [] }) {
  let schemeContext = [];
  let dbNote = '';

  try {
    if (eligibleSchemes && eligibleSchemes.length > 0) {
      schemeContext = await Scheme.find({ name: { $in: eligibleSchemes } }).lean();
    }
    
    // Also find schemes relevant to the user query and profile
    const allUserTexts = (messages || []).map(m => m.text || '').join(' ') + ' ' + (message || '');
    const userWords = allUserTexts.toLowerCase();
    
    // If specific topics mentioned, fetch relevant schemes from DB
    const additionalQueries = [];
    if (userWords.includes('pregnant') || userWords.includes('maternity') || userWords.includes('கர்ப்பிணி') || profile.isPregnant) {
      additionalQueries.push({ name: /muthulakshmi|maternity/i });
    }
    if (userWords.includes('child') || userWords.includes('ring') || userWords.includes('seer') || userWords.includes('தாய்மாமன்') || profile.hasNewborn) {
      additionalQueries.push({ name: /thaimaaman|gold ring/i });
    }
    if (userWords.includes('pension') || userWords.includes('வயதான') || (profile.age && profile.age >= 60)) {
      additionalQueries.push({ category: 'Pension' });
    }
    if (userWords.includes('student') || userWords.includes('கல்வி') || userWords.includes('college')) {
      additionalQueries.push({ category: 'Education' });
    }
    if (userWords.includes('health') || userWords.includes('maruthuva') || userWords.includes('மருத்துவ')) {
      additionalQueries.push({ category: 'Health' });
    }

    if (additionalQueries.length > 0) {
      const extraSchemes = await Scheme.find({ $or: additionalQueries }).limit(8).lean();
      const existingIds = new Set(schemeContext.map(s => String(s._id)));
      for (const es of extraSchemes) {
        if (!existingIds.has(String(es._id))) {
          schemeContext.push(es);
          existingIds.add(String(es._id));
        }
      }
    }

    // If still empty, provide the core Tamil Nadu welfare schemes as grounding
    if (schemeContext.length === 0) {
      schemeContext = await Scheme.find({
        name: {
          $in: [
            'Kalaignar Magalir Urimai Thogai',
            'Pudhumai Penn',
            'Tamil Pudhalvan',
            'Old Age Pension (IGNOAPS / TN)',
            'Destitute Widow Pension',
            'CM Comprehensive Health Insurance (CMCHIS)',
            'Vidiyal Payanam (Free Bus Travel)',
            'Dr. Muthulakshmi Reddy Maternity Benefit Scheme',
            'Thaimaaman Seer Thittam (Newborn Gold Ring Scheme)'
          ]
        }
      }).lean();
    }
  } catch (dbErr) {
    console.warn('[ChatRoute] DB lookup failed, falling back to basic context:', dbErr.message);
    dbNote = '\n(Note: Scheme database temporary lookup notice - answering using core verified scheme rules)';
  }

  // Format compact scheme context so Gemini gets crisp facts
  const compactSchemes = schemeContext.map(s => ({
    name: s.name,
    nameTamil: s.nameTamil,
    category: s.category,
    benefit: s.benefit || s.benefitSummary,
    monthlyAmount: s.benefitAmount || s.monthlyAmount,
    eligibility: s.eligibilitySummary || s.eligibilityCriteria || s.rules,
    requiredDocuments: s.requiredDocuments || s.docs,
    howToApply: s.howToApply || s.steps,
    officialPortal: s.sourceUrl
  }));

  const systemInstruction = `
You are a friendly, highly knowledgeable government schemes AI assistant for Tamil Nadu.
Your goal is to answer ANY questions the user asks about government welfare schemes, eligibility, benefits, application procedures, required documents, or status in Tamil Nadu.

Guidelines:
1. Speak in the user's language (Tamil, English, or Tanglish depending on what they use).
2. Format your response cleanly using Markdown (**bold** for scheme names, bullet points for documents or steps, numbered lists for application stages).
3. Be empathetic, encouraging, and clear. Avoid bureaucratic jargon.
4. When a user asks about schemes, recommend the best matching schemes from the Tamil Nadu Government database provided below. Detail the exact benefits, monetary amounts, and requirements.
5. If the user asks whether they qualify, evaluate against their profile and explain clearly why or what document/condition is needed.
6. If the user asks how to apply, give step-by-step instructions (e.g. visiting e-Sevai centre, submitting Aadhaar/ration card, or online portal).
7. If you do not have a particular rare private detail, guide them to their nearest e-Sevai centre, Taluk office, or the official portal tn.gov.in.

User Profile: ${JSON.stringify(profile || {})}
Tamil Nadu Schemes Database: ${JSON.stringify(compactSchemes)}${dbNote}
`;

  // Ensure history has valid entries with non-empty text
  let rawList = Array.isArray(messages) ? [...messages] : [];
  if (rawList.length === 0 && message) {
    rawList.push({ role: 'user', text: message });
  }

  const history = rawList
    .filter(m => m && typeof m.text === 'string' && m.text.trim().length > 0)
    .map(m => ({
      role: m.role === 'model' || m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text.trim() }],
    }));

  // Gemini requires at least one user turn in contents
  if (history.length === 0) {
    history.push({
      role: 'user',
      parts: [{ text: 'Hello, what schemes are available in Tamil Nadu?' }]
    });
  }

  return { systemInstruction, history };
}

const { isUserAiEnabled, isAiModeOff } = require('../lib/aiGate');
const { answerRuleBasedChat } = require('../lib/ruleChatAssistant');

/**
 * POST /api/chat - Streaming SSE Endpoint
 */
router.post('/', async (req, res) => {
  const reqId = req.id || `req-${Date.now()}`;
  let clientConnected = true;
  let heartbeatTimer = null;

  req.on('close', () => {
    clientConnected = false;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    console.log(`[${reqId}] Client disconnected from chat stream`);
  });

  const { messages, profile, eligibleSchemes } = req.body || {};

  // If AI is disabled or AI mode is off, respond with rule-based assistant
  if (isAiModeOff() || !isUserAiEnabled()) {
    try {
      const ruleResult = await answerRuleBasedChat({ messages, profile, eligibleSchemes });
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      // Stream words smoothly
      const words = ruleResult.answer.split(' ');
      for (let i = 0; i < words.length; i += 3) {
        if (!clientConnected) break;
        const chunk = words.slice(i, i + 3).join(' ') + ' ';
        res.write(`data: ${JSON.stringify({ text: chunk, model: 'rule-based' })}\n\n`);
        if (typeof res.flush === 'function') res.flush();
      }

      if (clientConnected) {
        res.write('data: [DONE]\n\n');
        res.end();
      }
      return;
    } catch (ruleErr) {
      console.error(`[${reqId}] Rule-based assistant error:`, ruleErr.message);
    }
  }

  try {
    const { systemInstruction, history } = await buildChatContext({ messages, profile, eligibleSchemes });

    // Try starting Gemini stream BEFORE setting SSE headers
    const { stream, modelUsed } = await generateContentStreamWithRetry({
      contents: history,
      systemInstruction,
      options: { isChat: true }
    });

    if (!clientConnected) return;

    // Set SSE headers now that stream is established
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    // Send heartbeat comment every 15 seconds
    heartbeatTimer = setInterval(() => {
      if (clientConnected) {
        res.write(': heartbeat\n\n');
        if (typeof res.flush === 'function') res.flush();
      }
    }, 15000);

    for await (const chunk of stream) {
      if (!clientConnected) break;
      const textChunk = chunk.text || '';
      if (textChunk.length > 0) {
        res.write(`data: ${JSON.stringify({ text: textChunk, model: modelUsed })}\n\n`);
        if (typeof res.flush === 'function') res.flush();
      }
    }

    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (clientConnected) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (err) {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    const mapped = mapGeminiErrorCode(err);
    console.error(`[${reqId}] Chat streaming error [${mapped.code}]:`, err.message);

    // Rule-based fallback if quota exhausted or AI error
    let plainAnswer = null;
    try {
      const ruleResult = await answerRuleBasedChat({ messages, profile, eligibleSchemes });
      plainAnswer = ruleResult.answer;
    } catch (ruleErr) {
      console.warn(`[${reqId}] Rule fallback lookup error:`, ruleErr.message);
    }

    if (res.headersSent) {
      if (clientConnected) {
        res.write(`event: error\ndata: ${JSON.stringify({ code: mapped.code, error: 'The AI assistant is currently unavailable.', answer: plainAnswer, isPlainLookup: !!plainAnswer })}\n\n`);
        res.end();
      }
    } else {
      res.status(mapped.code === 'ai_quota_exhausted' ? 429 : 200).json({
        code: mapped.code === 'ai_quota_exhausted' ? 'ai_quota_exhausted' : mapped.code,
        error: 'The AI assistant is currently unavailable.',
        answer: plainAnswer,
        isPlainLookup: !!plainAnswer
      });
    }
  }
});

/**
 * POST /api/chat/simple - Non-streaming fallback endpoint
 */
router.post('/simple', async (req, res) => {
  const reqId = req.id || `req-${Date.now()}`;
  const { messages, profile, eligibleSchemes } = req.body || {};

  // If AI is disabled or AI mode is off, respond immediately with rule-based assistant
  if (isAiModeOff() || !isUserAiEnabled()) {
    try {
      const ruleResult = await answerRuleBasedChat({ messages, profile, eligibleSchemes });
      return res.json({
        code: 'ok',
        answer: ruleResult.answer,
        model: 'rule-based',
        isPlainLookup: true,
        sources: ['TN Government Portals', 'e-Sevai Database']
      });
    } catch (ruleErr) {
      console.error(`[${reqId}] Rule-based simple assistant error:`, ruleErr.message);
    }
  }

  try {
    const { systemInstruction, history } = await buildChatContext({ messages, profile, eligibleSchemes });

    const { text, modelUsed } = await generateContentWithRetry({
      contents: history,
      systemInstruction,
      options: { isChat: true }
    });

    res.json({
      code: 'ok',
      answer: text,
      model: modelUsed,
      sources: ['TN Government Portals', 'e-Sevai Database'],
    });
  } catch (err) {
    const mapped = mapGeminiErrorCode(err);
    console.error(`[${reqId}] Chat simple fallback error [${mapped.code}]:`, err.message);

    let plainAnswer = null;
    try {
      const ruleResult = await answerRuleBasedChat({ messages, profile, eligibleSchemes });
      plainAnswer = ruleResult.answer;
    } catch (ruleErr) {}

    if (plainAnswer) {
      return res.json({
        code: 'ok',
        answer: plainAnswer,
        model: 'rule-based-fallback',
        isPlainLookup: true,
        sources: ['TN Government Portals', 'e-Sevai Database'],
        notice: 'Generated using official Tamil Nadu verified scheme guidelines.'
      });
    }

    res.status(mapped.code === 'ai_quota_exhausted' ? 429 : 200).json({
      code: mapped.code === 'ai_quota_exhausted' ? 'ai_quota_exhausted' : mapped.code,
      error: mapped.message || 'AI is currently unavailable.',
      answer: plainAnswer,
      isPlainLookup: !!plainAnswer
    });
  }
});

module.exports = router;
