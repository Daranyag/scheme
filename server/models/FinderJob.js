const mongoose = require('mongoose');

const finderJobSchema = new mongoose.Schema({
    deviceId: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['queued', 'processing', 'completed', 'failed'], default: 'queued' },
    progressMessage: { type: String, default: 'Queued...' },
    inputHash: { type: String }, // To cache identical requests
    result: { type: mongoose.Schema.Types.Mixed }, // The extracted scheme or error message
    createdAt: { type: Date, default: Date.now, expires: '24h' } // Auto-delete after 24h
});

// Index for caching
finderJobSchema.index({ inputHash: 1, status: 1 });

module.exports = mongoose.model('FinderJob', finderJobSchema);
