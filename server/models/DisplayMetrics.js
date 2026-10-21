const mongoose = require('mongoose');

const displayMetricsSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true },
  algoSummaries: { type: Number, default: 0 },
  aiSummaries: { type: Number, default: 0 },
  cacheHits: { type: Number, default: 0 },
  cacheMisses: { type: Number, default: 0 },
  rejections: { type: Number, default: 0 },
  rejectionReasons: { type: [String], default: [] },
  displayAiCallsToday: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('DisplayMetrics', displayMetricsSchema);
