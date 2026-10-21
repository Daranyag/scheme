const { getQuotaAndBudgetStatus } = require('./gemini');

let loggedAiDisabled = false;

function isAiModeOff() {
  const aiMode = (process.env.AI_MODE || 'auto').toLowerCase();
  const fetchOnly = (process.env.FETCH_ONLY || '').toLowerCase() === 'true';
  return aiMode === 'off' || fetchOnly;
}

function isUserAiEnabled() {
  if (process.env.AI_ENABLED === 'false') {
    return false;
  }
  if (process.env.USER_AI_ENABLED === 'false') {
    return false;
  }
  return true;
}

/**
 * Universal AI Gate for ALL Gemini calls across the server.
 * Only two purposes are allowed: "display" and "user" (chat and the Finder).
 * A call with any other purpose is refused with code ai_disabled.
 * 
 * @param {Object} params
 * @param {'display'|'user'} params.purpose - 'display' (presenter AI explanations) or 'user' (chat, finder)
 * @param {Function} params.execute - Async function performing the actual Gemini call
 * @param {Object} [params.options] - Extra context
 */
async function callGemini({ purpose, execute, options = {} }) {
  if (typeof execute !== 'function') {
    throw new Error('callGemini requires an execute function');
  }

  // 1. Quota check first (if quota is exhausted, report ai_quota_exhausted regardless of purpose)
  const quotaStatus = await getQuotaAndBudgetStatus();
  if (quotaStatus.quotaExhaustedUntil && new Date() < quotaStatus.quotaExhaustedUntil) {
    return {
      ok: false,
      code: 'ai_quota_exhausted',
      error: 'The AI assistant has reached its usage limit for now. Please try again later.'
    };
  }

  // 2. Enforce allowed purposes: only "display" and "user"
  const allowedPurposes = ['display', 'user'];
  if (!purpose || !allowedPurposes.includes(purpose)) {
    if (!loggedAiDisabled) {
      console.log(`[AIGate] AI call refused for purpose "${purpose || 'none'}". Only "display" and "user" purposes are permitted.`);
      loggedAiDisabled = true;
    }
    return {
      ok: false,
      code: 'ai_disabled',
      text: '',
      candidates: [],
      data: null,
      errorType: 'ai_disabled',
      skipped: true,
      error: `AI is disabled for purpose "${purpose || 'unspecified'}". Allowed purposes are: display, user.`
    };
  }

  // 2. Global AI-off mode check: if AI_MODE=off or FETCH_ONLY=true, display is also disabled
  if (isAiModeOff()) {
    if (!loggedAiDisabled) {
      console.log('[AIGate] AI is OFF (AI_MODE=off or FETCH_ONLY=true). All background & display Gemini calls disabled.');
      loggedAiDisabled = true;
    }
    return {
      ok: false,
      code: 'ai_disabled',
      text: '',
      candidates: [],
      data: null,
      errorType: 'ai_disabled',
      skipped: true,
      error: 'AI is disabled in AI_MODE=off / FETCH_ONLY=true.'
    };
  }

  // 3. User rules: if purpose is "user", check USER_AI_ENABLED
  if (purpose === 'user') {
    if (!isUserAiEnabled()) {
      return {
        ok: false,
        code: 'user_ai_disabled',
        error: 'AI is disabled for user requests by configuration (USER_AI_ENABLED=false).'
      };
    }
  }

  // 4. Allowed to execute
  try {
    const result = await execute();
    return {
      ok: true,
      data: result,
      ...(typeof result === 'object' && result !== null ? result : { text: result })
    };
  } catch (err) {
    const errCode = err.code || err.status || 'ai_error';
    return {
      ok: false,
      code: errCode,
      error: err.message || String(err),
      rawError: err
    };
  }
}

function resetGateForTesting() {
  loggedAiDisabled = false;
}

module.exports = {
  callGemini,
  isAiModeOff,
  isUserAiEnabled,
  resetGateForTesting
};
