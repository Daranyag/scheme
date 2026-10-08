const mongoose = require('mongoose');

const unmatchedQuerySchema = new mongoose.Schema({
  query: { type: String, required: true },
  language: { type: String },
  count: { type: Number, default: 1 },
  lastSeenAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('UnmatchedQuery', unmatchedQuerySchema);
