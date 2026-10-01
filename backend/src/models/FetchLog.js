const mongoose = require('mongoose');

const fetchLogSchema = mongoose.Schema(
  {
    sourceName: { type: String, required: true },
    status: { type: String, required: true, enum: ['SUCCESS', 'FAILED'] },
    recordsFetched: { type: Number, default: 0 },
    recordsSaved: { type: Number, default: 0 },
    errorMessage: { type: String },
    durationMs: { type: Number }
  },
  { timestamps: true }
);

const FetchLog = mongoose.model('FetchLog', fetchLogSchema);
module.exports = FetchLog;
