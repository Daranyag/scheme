const mongoose = require('mongoose');

const helpCenterSchema = new mongoose.Schema({
    sourceId: { type: String, required: true }, // e.g. Google Places ID or dataset row ID
    name: { type: String, required: true },
    type: { type: String, enum: ['e-sevai', 'taluk', 'collectorate', 'social_welfare', 'other'] },
    address: { type: String },
    phone: { type: String },
    location: {
        type: { type: String, default: 'Point' },
        coordinates: { type: [Number], required: true } // [lng, lat]
    },
    hours: [String],
    mapsUrl: { type: String },
    source: { type: String, enum: ['official-dataset', 'google-places'] },
    fetchedAt: { type: Date, default: Date.now }
});

// Geospatial index for nearby searches
helpCenterSchema.index({ location: '2dsphere' });
// Index for caching Google Places queries
helpCenterSchema.index({ fetchedAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

module.exports = mongoose.model('HelpCenter', helpCenterSchema);
