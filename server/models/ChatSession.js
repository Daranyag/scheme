const mongoose = require('mongoose');

const chatSessionSchema = new mongoose.Schema({
    deviceId: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    messages: [{
        role: { type: String, enum: ['user', 'model'], required: true },
        text: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        sources: [{ title: String, url: String, verifiedAt: Date }]
    }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Index for fetching by deviceId
chatSessionSchema.index({ deviceId: 1, updatedAt: -1 });

module.exports = mongoose.model('ChatSession', chatSessionSchema);
