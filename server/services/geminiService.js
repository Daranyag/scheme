const {
  generateContentWithRetry,
  generateContentStreamWithRetry,
  mapGeminiErrorCode
} = require('../lib/gemini');
const geminiConfig = require('../lib/geminiConfig');

module.exports = {
  generateContentWithRetry,
  generateContentStreamWithRetry,
  mapGeminiErrorCode,
  get PRIMARY_MODEL() {
    return geminiConfig.getModels().mainModel;
  },
  get BACKUP_MODEL() {
    return geminiConfig.getModels().fallbackModel;
  }
};
