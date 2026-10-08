const mongoose = require('mongoose');

const trackedApplicationSchema = new mongoose.Schema({
    deviceId: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    profileId: { type: String, required: true },
    schemeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Scheme', required: true },
    status: { 
        type: String, 
        enum: ['not_started', 'preparing_documents', 'applied', 'under_review', 'approved', 'rejected', 'renewal_due'],
        default: 'not_started'
    },
    statusHistory: [{
        status: String,
        date: { type: Date, default: Date.now }
    }],
    appliedDate: { type: Date },
    // Privacy: No notes, no photos, no application numbers are synced to the backend.
    updatedAt: { type: Date, default: Date.now }
});

// Index for fast lookups per profile and scheme
trackedApplicationSchema.index({ deviceId: 1, profileId: 1, schemeId: 1 }, { unique: true });

module.exports = mongoose.model('TrackedApplication', trackedApplicationSchema);
