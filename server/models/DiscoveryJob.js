const mongoose = require('mongoose');

const discoveryJobSchema = new mongoose.Schema({
    deviceId: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    profileSync: { type: Object, required: true },
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    lastRunAt: { type: Date },
    nextRunAt: { type: Date },
    lockedAt: { type: Date },
    logs: [{ 
        timestamp: { type: Date, default: Date.now },
        message: String,
        details: mongoose.Schema.Types.Mixed
    }]
}, { timestamps: true });

module.exports = mongoose.model('DiscoveryJob', discoveryJobSchema);
