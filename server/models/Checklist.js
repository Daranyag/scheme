const mongoose = require('mongoose');

const checklistSchema = new mongoose.Schema({
    deviceId: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    profileId: { type: String, required: true },
    schemeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Scheme', required: true },
    documents: [{
        originalName: String,
        normalizedName: String,
        isTicked: { type: Boolean, default: false },
        notes: { type: String, default: '' },
        expectedDate: { type: Date }
    }],
    updatedAt: { type: Date, default: Date.now }
});

// Index for fast lookups per profile and scheme
checklistSchema.index({ deviceId: 1, profileId: 1, schemeId: 1 }, { unique: true });

module.exports = mongoose.model('Checklist', checklistSchema);
