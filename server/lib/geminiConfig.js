const { GoogleGenAI } = require('@google/genai');

const PREFERENCE_LIST = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite'
];

let cachedConfig = null;
let initPromise = null;

function getConfiguredNames() {
  const mainModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';
  const backgroundModel = process.env.GEMINI_BACKGROUND_MODEL || fallbackModel;
  const groundingModel = process.env.GEMINI_GROUNDING_MODEL || mainModel;
  return { mainModel, fallbackModel, backgroundModel, groundingModel };
}

async function resolveModels(options = {}) {
  if (cachedConfig && !options.forceRefresh) {
    return cachedConfig;
  }

  if (initPromise && !options.forceRefresh) {
    return initPromise;
  }

  initPromise = (async () => {
    const configured = getConfiguredNames();
    const apiKey = process.env.GEMINI_API_KEY;

    let availableModels = [];
    let listSuccess = false;

    const isAiOff = (process.env.AI_MODE || 'auto').toLowerCase() === 'off' || (process.env.FETCH_ONLY || '').toLowerCase() === 'true';

    if (!isAiOff && ((apiKey && apiKey.trim().length > 0) || options.customClient) && !options.skipNetwork) {
      try {
        const { callGemini } = require('./aiGate');
        const gateRes = await callGemini({
          purpose: 'background',
          execute: async () => {
            const ai = options.customClient || new GoogleGenAI({ apiKey: apiKey.trim() });
            const res = await ai.models.list();
            for await (const m of res) {
              const actions = m.supportedActions || m.supportedGenerationMethods || [];
              if (actions.includes('generateContent') || actions.includes('generateContentStream')) {
                const cleanName = m.name.replace(/^models\//, '');
                availableModels.push(cleanName);
              }
            }
            return availableModels;
          }
        });
        if (gateRes.ok && availableModels.length > 0) {
          listSuccess = true;
        }
      } catch (err) {
        console.warn(`[GeminiConfig] Warning: ListModels call failed (${err.message || err}). Using configured model names.`);
      }
    }

    let mainModel = configured.mainModel;
    let fallbackModel = configured.fallbackModel;
    let backgroundModel = configured.backgroundModel;
    let groundingModel = configured.groundingModel;
    let isGroundingSupported = true;

    if (listSuccess && availableModels.length > 0) {
      // Check Main Model
      if (!availableModels.includes(configured.mainModel)) {
        const picked = PREFERENCE_LIST.find(m => availableModels.includes(m)) || availableModels[0];
        console.log(`Using model ${picked} instead of ${configured.mainModel}`);
        mainModel = picked;
      }

      // Check Fallback Model
      if (!availableModels.includes(configured.fallbackModel)) {
        const pickedFallback = PREFERENCE_LIST.find(m => availableModels.includes(m) && m !== mainModel) || 
                               availableModels.find(m => m !== mainModel) || 
                               availableModels[0];
        console.log(`Using model ${pickedFallback} instead of ${configured.fallbackModel}`);
        fallbackModel = pickedFallback;
      }

      // Check Background Model
      if (!availableModels.includes(configured.backgroundModel)) {
        backgroundModel = fallbackModel;
      }

      // Check Grounding Model
      if (!availableModels.includes(configured.groundingModel)) {
        groundingModel = mainModel;
      }

      // Check Grounding capability for chosen grounding model
      if (groundingModel.includes('lite')) {
        isGroundingSupported = false;
        console.warn(`Grounding is not supported by chosen model ${groundingModel}. Grounding will be skipped.`);
      }
    }

    cachedConfig = {
      mainModel,
      fallbackModel,
      backgroundModel,
      groundingModel,
      autoSelectedModel: mainModel,
      isGroundingSupported,
      availableModels,
      listSuccess
    };

    return cachedConfig;
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

function getModels() {
  if (cachedConfig) {
    return cachedConfig;
  }
  const configured = getConfiguredNames();
  return {
    mainModel: configured.mainModel,
    fallbackModel: configured.fallbackModel,
    backgroundModel: configured.backgroundModel,
    groundingModel: configured.groundingModel,
    autoSelectedModel: configured.mainModel,
    isGroundingSupported: !configured.groundingModel.includes('lite'),
    availableModels: [],
    listSuccess: false
  };
}

function resetConfigForTesting() {
  cachedConfig = null;
  initPromise = null;
}

module.exports = {
  resolveModels,
  getModels,
  getConfiguredNames,
  PREFERENCE_LIST,
  resetConfigForTesting
};
