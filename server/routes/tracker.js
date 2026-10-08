const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const TrackedApplication = require('../models/TrackedApplication');
const Checklist = require('../models/Checklist');

const trackerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: { error: 'Too many sync requests, please try again later.' }
});

router.post('/sync', trackerLimiter, async (req, res) => {
    const { deviceId, profileId, schemeId, status, appliedDate } = req.body;

    if (!deviceId || !profileId || !schemeId || !status) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        let app = await TrackedApplication.findOne({ deviceId, profileId, schemeId });
        
        if (app) {
            if (app.status !== status) {
                app.status = status;
                app.statusHistory.push({ status, date: new Date() });
            }
            if (appliedDate) app.appliedDate = new Date(appliedDate);
            app.updatedAt = new Date();
        } else {
            app = new TrackedApplication({
                deviceId,
                profileId,
                schemeId,
                status,
                appliedDate: appliedDate ? new Date(appliedDate) : null,
                statusHistory: [{ status, date: new Date() }]
            });
        }
        
        await app.save();
        res.json({ message: 'Tracker synced successfully', status: app.status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/', async (req, res) => {
    const { deviceId, profileId } = req.query;
    if (!deviceId || !profileId) return res.status(400).json({ error: 'Missing deviceId or profileId' });

    try {
        const apps = await TrackedApplication.find({ deviceId, profileId }).populate('schemeId', 'name');
        res.json(apps);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:profileId', async (req, res) => {
    const { deviceId } = req.query; // Ensure deviceId is provided for security
    const { profileId } = req.params;
    if (!deviceId || !profileId) return res.status(400).json({ error: 'Missing parameters' });

    try {
        // Delete both Tracker and Checklist data for this profile
        await TrackedApplication.deleteMany({ deviceId, profileId });
        await Checklist.deleteMany({ deviceId, profileId });
        res.json({ message: 'Profile data securely deleted from backend.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
