const mongoose = require('mongoose');

const sourceSchema = new mongoose.Schema({
    name: { type: String, required: true },
    url: { type: String, required: true },
    category: { type: String },
    type: { 
        type: String, 
        enum: ['official-portal', 'department', 'central-portal', 'open-data', 'gazette-or-press', 'news-signal'],
        required: true
    },
    priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
    fetchMethod: { type: String, enum: ['html', 'pdf', 'sitemap', 'rss', 'json-api'], default: 'html' },
    schedule: { type: String, default: 'daily' }, // e.g. cron string or interval
    crawlDepth: { type: Number, default: 1 },
    maxPages: { type: Number, default: 10 },
    allowedDomains: [String],
    robotsStatus: { type: String, enum: ['allowed', 'restricted', 'unknown'], default: 'unknown' },
    termsNote: { type: String },
    enabled: { type: Boolean, default: true },
    trustLevel: { type: String, enum: ['official', 'reputable', 'signal-only'], required: true },
    lastSuccessAt: { type: Date },
    lastErrorAt: { type: Date },
    consecutiveFailures: { type: Number, default: 0 },
    avgResponseMs: { type: Number, default: 0 },
    parserNotes: { type: String },
    contentHash: { type: String }, // Hash of last fetch to avoid Gemini calls
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Source', sourceSchema);
