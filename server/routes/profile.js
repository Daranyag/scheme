const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const DiscoveryJob = require('../models/DiscoveryJob');
const { runSingleJob } = require('../services/discoveryService');
const { authenticateOwner } = require('../middleware/auth');

router.post('/sync', authenticateOwner, async (req, res) => {
    const { profile } = req.body;
    const owner = req.owner || {};
    const ownerId = owner.id || req.body.deviceId;

    if (!ownerId || !profile) {
        return res.status(400).json({ error: 'deviceId or Bearer token, and profile are required' });
    }

    try {
        // Strip out PII if any accidentally sent. Keep ONLY anonymous fields.
        const safeProfile = {
            age: profile.age !== undefined ? Number(profile.age) : null,
            gender: profile.gender || 'F',
            incomeBand: profile.incomeBand || (profile.income ? (profile.income < 100000 ? 'under 1 lakh' : (profile.income <= 250000 ? '1–2.5 lakh' : '2.5–5 lakh')) : 'under 1 lakh'),
            income: profile.income !== undefined ? Number(profile.income) : null,
            marital: profile.marital || 'single',
            disability: profile.disability !== undefined ? Number(profile.disability) : 0,
            flags: {
                destitute: Boolean(profile.flags?.destitute ?? profile.destitute),
                famhead: Boolean(profile.flags?.famhead ?? profile.famhead),
                govschool: Boolean(profile.flags?.govschool ?? profile.govschool),
                highered: Boolean(profile.flags?.highered ?? profile.highered),
                has_car: Boolean(profile.flags?.has_car ?? profile.hasCar),
                excess_land: Boolean(profile.flags?.excess_land ?? profile.excessLand)
            }
        };

        let jobId = 'mock-job-id';

        if (mongoose.connection.readyState === 1) {
            const query = owner.type === 'user' 
                ? { userId: owner.id } 
                : { deviceId: owner.id };

            let job = await DiscoveryJob.findOne(query);
            let shouldTriggerWorker = false;

            if (job) {
                const recentlyRun = job.lastRunAt && (new Date() - job.lastRunAt < 24 * 60 * 60 * 1000);
                const profileChanged = JSON.stringify(job.profileSync) !== JSON.stringify(safeProfile);

                if (!recentlyRun || profileChanged) {
                    job.profileSync = safeProfile;
                    job.status = 'pending';
                    job.nextRunAt = new Date();
                    await job.save();
                    shouldTriggerWorker = true;
                }
            } else {
                job = new DiscoveryJob({
                    deviceId: owner.type === 'guest' ? owner.id : (req.body.deviceId || 'user-device'),
                    userId: owner.type === 'user' ? owner.id : null,
                    profileSync: safeProfile,
                    status: 'pending',
                    nextRunAt: new Date()
                });
                await job.save();
                shouldTriggerWorker = true;
            }

            jobId = job._id;

            if (shouldTriggerWorker) {
                runSingleJob(job).catch(err => console.error(`Error running discovery job for ${ownerId}:`, err.message));
            }
        }

        res.json({ message: 'Profile synced. Discovery job queued.', jobId, safeProfile });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/profile/full (Only for authenticated users)
router.get('/full', authenticateOwner, async (req, res) => {
    const owner = req.owner || {};
    if (owner.type !== 'user') {
        return res.status(403).json({ error: 'Only registered users can sync full profile' });
    }
    try {
        const User = require('../models/User');
        const user = await User.findById(owner.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ fullProfile: user.fullProfile || {} });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/profile/full (Only for authenticated users)
router.post('/full', authenticateOwner, async (req, res) => {
    const owner = req.owner || {};
    const { fullProfile } = req.body;
    if (owner.type !== 'user') {
        return res.status(403).json({ error: 'Only registered users can sync full profile' });
    }
    if (!fullProfile) {
        return res.status(400).json({ error: 'fullProfile is required' });
    }
    try {
        const User = require('../models/User');
        await User.findByIdAndUpdate(owner.id, { fullProfile });
        res.json({ message: 'Full profile saved successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
