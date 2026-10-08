const mongoose = require('mongoose');

const searchLogSchema = new mongoose.Schema({
  query: { type: String, required: true },
  normalizedQuery: { type: String },
  language: { type: String },
  levelReached: { type: Number },
  resultCount: { type: Number },
  clickedResultId: { type: mongoose.Schema.Types.ObjectId, ref: 'Scheme' },
  createdAt: { type: Date, default: Date.now, expires: '90d' } // 90 days retention
});

module.exports = mongoose.model('SearchLog', searchLogSchema);
