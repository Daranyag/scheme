const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Discovery = require('../models/Discovery');
const { authenticateOwner } = require('../middleware/auth');

const Scheme = require('../models/Scheme');
const Fact = require('../models/Fact');

// GET /api/discoveries?deviceId=...
router.get('/', authenticateOwner, async (req, res) => {
    const owner = req.owner || {};
    const ownerId = owner.id || req.query.deviceId;

    if (!ownerId) {
        return res.status(400).json({ error: 'deviceId query parameter or Bearer token is required' });
    }

    try {
        let rawDiscoveries = [];

        if (mongoose.connection.readyState === 1) {
            const query = owner.type === 'user'
                ? { userId: owner.id, notRelevant: { $ne: true } }
                : { deviceId: owner.id, notRelevant: { $ne: true } };

            rawDiscoveries = await Discovery.find(query).sort({ createdAt: -1 }).lean();
        }

        // Truthful filter: Only show records that have a scheme name in heading/title and >= 1 quoted fact
        const discoveries = [];
        for (const d of rawDiscoveries) {
            // Look up corresponding Scheme record
            const scheme = await Scheme.findOne({
                $or: [
                    { name: d.name },
                    { name: new RegExp('^' + d.name + '$', 'i') }
                ]
            }).lean();

            let quotedFacts = [];
            if (scheme) {
                // If the scheme was reviewed and rejected, do not show as newly discovered
                if (scheme.reviewStatus === 'rejected') {
                    continue;
                }
                quotedFacts = await Fact.find({
                    schemeId: scheme._id,
                    quote: { $exists: true, $ne: '' },
                    rejected: { $ne: true }
                }).lean();
            }

            // Must have at least one quoted fact
            const totalQuotedFacts = quotedFacts.length || (d.quotedFactsCount || 0);
            if (totalQuotedFacts === 0) {
                continue;
            }

            // Scheme name must be in heading or title (verified by scraper or scheme)
            const hasHeadingMatch = d.hasNameInHeadingOrTitle !== false;
            if (!hasHeadingMatch) {
                continue;
            }

            // Determine extractedBy: 'ai' only if AI really produced a fact, else 'rules' / 'scraped'
            let extractedBy = d.extractedBy || 'rules';
            if (quotedFacts.length > 0) {
                const hasAiFact = quotedFacts.some(f => f.extractedBy === 'ai');
                extractedBy = hasAiFact ? 'ai' : (quotedFacts[0].extractedBy || 'rules');
            }

            discoveries.push({
                ...d,
                extractedBy,
                quotedFactsCount: totalQuotedFacts,
                eligibilityStatus: 'possibly_eligible' // Pending discoveries must never be marked fully eligible
            });
        }

        const unseenCount = discoveries.filter(d => !d.seen).length;

        res.json({
            count: discoveries.length,
            unseenCount,
            discoveries
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/discoveries/:id/dismiss (Mark as Not Relevant)
router.post('/:id/dismiss', authenticateOwner, async (req, res) => {
    try {
        let discovery = { _id: req.params.id, notRelevant: true };

        if (mongoose.connection.readyState === 1) {
            discovery = await Discovery.findByIdAndUpdate(
                req.params.id,
                { notRelevant: true },
                { returnDocument: 'after' }
            );

            if (!discovery) {
                return res.status(404).json({ error: 'Discovery record not found' });
            }
        }

        res.json({ message: 'Discovery marked as not relevant', discovery });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/discoveries/mark-seen
router.post('/mark-seen', authenticateOwner, async (req, res) => {
    const owner = req.owner || {};

    try {
        if (mongoose.connection.readyState === 1 && owner.id) {
            const query = owner.type === 'user'
                ? { userId: owner.id, seen: false }
                : { deviceId: owner.id, seen: false };

            await Discovery.updateMany(query, { seen: true });
        }

        res.json({ message: 'All discoveries marked as seen' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
