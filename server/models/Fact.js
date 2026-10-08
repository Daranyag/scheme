const mongoose = require('mongoose');

const factSchema = new mongoose.Schema({
  schemeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Scheme', required: true },
  field: { type: String, required: true }, // amount, ageMin, incomeLimit, status, document, step, link, deadline, goNumber, goDate
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  quote: { type: String, required: true },
  sourceUrl: { type: String, required: true },
  sourceDomain: { type: String, required: true },
  sourceTrust: { type: String, enum: ['official', 'reputable', 'signal-only'], required: true },
  contentHash: { type: String, required: true },
  fetchedAt: { type: Date, default: Date.now },
  extractedBy: { type: String, enum: ['selector', 'regex', 'ai', 'rules'], required: true },
  confidence: { type: Number, min: 0, max: 100, default: 100 },
  rejected: { type: Boolean, default: false },
  rejectReason: { type: String }
}, { timestamps: true });

// Ensure fast lookup
factSchema.index({ schemeId: 1, field: 1 });
factSchema.index({ sourceUrl: 1 });

module.exports = mongoose.model('Fact', factSchema);
