const mongoose = require('mongoose');

const discoverySchema = new mongoose.Schema({
    deviceId: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    name: { type: String, required: true },
    nameTamil: { type: String, default: '' },
    benefit: { type: String, required: true },
    domain: { type: String, required: true },
    sourceUrl: { type: String, required: true },
    confidence: { type: String, enum: ['high', 'medium'], required: true },
    eligibilityStatus: { type: String, enum: ['eligible', 'possibly_eligible'], required: true },
    rules: { type: Object, default: {} },
    unmappedCriteria: { type: [String], default: [] },
    docs: { type: [String], default: [] },
    steps: { type: [String], default: [] },
    origin: { type: String, default: 'ai-discovered' },
    extractedBy: { type: String, default: 'rules' },
    hasNameInHeadingOrTitle: { type: Boolean, default: true },
    quotedFactsCount: { type: Number, default: 0 },
    lastChecked: { type: Date, default: Date.now },
    seen: { type: Boolean, default: false },
    notRelevant: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Discovery', discoverySchema);
