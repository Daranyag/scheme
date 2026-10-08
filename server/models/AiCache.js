const mongoose = require('mongoose');

const aiCacheSchema = new mongoose.Schema({
  promptHash: { type: String, required: true, unique: true },
  response: { type: mongoose.Schema.Types.Mixed, required: true },
  modelUsed: { type: String },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

aiCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AiCache', aiCacheSchema);
