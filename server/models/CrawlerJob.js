const mongoose = require('mongoose');

const crawlerJobSchema = new mongoose.Schema({
    sourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Source', required: true },
    type: { type: String, enum: ['fetch', 'extract', 'diff'], default: 'fetch' },
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed', 'circuit_breaker_tripped'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    lockedBy: { type: String }, // worker ID
    lockedUntil: { type: Date },
    nextRunAt: { type: Date, default: Date.now },
    logs: [{
        timestamp: { type: Date, default: Date.now },
        message: String,
        details: mongoose.Schema.Types.Mixed
    }]
});

// Index for job queue polling
crawlerJobSchema.index({ status: 1, nextRunAt: 1, lockedUntil: 1 });

module.exports = mongoose.model('CrawlerJob', crawlerJobSchema);
