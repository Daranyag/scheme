const mongoose = require('mongoose');

const displayCacheSchema = new mongoose.Schema({
  cacheKey: { type: String, required: true, unique: true },
  schemeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Scheme', required: true },
  contentHash: { type: String, required: true },
  language: { type: String, default: 'en' },
  readingLevel: { type: String, default: 'simple' },
  promptVersion: { type: String, default: 'v1' },
  response: { type: mongoose.Schema.Types.Mixed, required: true },
  explainedBy: { type: String, enum: ['ai', 'algorithm'], default: 'ai' },
  citations: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
}, { timestamps: true });

displayCacheSchema.index({ schemeId: 1, contentHash: 1 });
displayCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('DisplayCache', displayCacheSchema);
