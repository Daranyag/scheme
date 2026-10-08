const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Discovery = require('../models/Discovery');
const { authenticateOwner } = require('../middleware/auth');

// GET /api/discoveries?deviceId=...
router.get('/', authenticateOwner, async (req, res) => {
    const owner = req.owner || {};
    const ownerId = owner.id || req.query.deviceId;

    if (!ownerId) {
        return res.status(400).json({ error: 'deviceId query parameter or Bearer token is required' });
    }

    try {
        let discoveries = [];

        if (mongoose.connection.readyState === 1) {
            const query = owner.type === 'user'
                ? { userId: owner.id, notRelevant: { $ne: true } }
                : { deviceId: owner.id, notRelevant: { $ne: true } };

            discoveries = await Discovery.find(query).sort({ createdAt: -1 });
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
