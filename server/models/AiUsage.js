const mongoose = require('mongoose');

const aiUsageSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true },
  totalCalls: { type: Number, default: 0 },
  chatCalls: { type: Number, default: 0 },
  backgroundCalls: { type: Number, default: 0 },
  quotaExhaustedUntil: { type: Date, default: null },
  lastErrorCode: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('AiUsage', aiUsageSchema);
