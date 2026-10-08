const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Source = require('../models/Source');
const Scheme = require('../models/Scheme');
// Assuming models like CrawlerJob, Fact etc. exist.

// Middleware to verify Admin Key using constant-time comparison
const verifyAdminKey = (req, res, next) => {
    const providedKey = req.header('x-admin-key');
    const actualKey = process.env.ADMIN_KEY;
    
    if (!providedKey || !actualKey) {
        return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }
    
    try {
        const providedBuffer = Buffer.from(providedKey);
        const actualBuffer = Buffer.from(actualKey);
        
        if (providedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(providedBuffer, actualBuffer)) {
            return res.status(401).json({ ok: false, message: 'Unauthorized' });
        }
        next();
    } catch (err) {
        return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }
};

router.use(verifyAdminKey);

router.get('/jobs', async (req, res) => {
    try {
        // Return dummy data or query CrawlerJob collections if they exist
        res.json({
            ok: true,
            jobs: [],
            schedulerActive: process.env.ENABLE_SCHEDULER === 'true'
        });
    } catch (err) {
        res.status(500).json({ ok: false, message: 'Failed to fetch jobs' });
    }
});

router.get('/activity', (req, res) => {
    // Server-Sent Events setup
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    
    sendEvent({ type: 'connected', message: 'Live activity stream connected' });
    
    // In a real implementation, you would attach to a global EventEmitter 
    // where the logger broadcasts events. For now, we simulate a heartbeat.
    const intervalId = setInterval(() => {
        sendEvent({ type: 'ping', timestamp: new Date() });
    }, 5000);
    
    req.on('close', () => {
        clearInterval(intervalId);
    });
});

router.get('/ai-usage', (req, res) => {
    // Mock response for AI usage
    res.json({
        ok: true,
        callsToday: 15,
        dailyCap: 1500,
        quotaExhausted: false,
        callsSavedByHashing: 34
    });
});

router.get('/alerts', async (req, res) => {
    try {
        const failingSources = await Source.find({ healthStatus: { $ne: 'working' } }).lean();
        // Return mock alerts based on failing sources
        const alerts = failingSources.map(s => ({
            id: s._id,
            type: 'source_failing',
            message: `Source ${s.domain} is failing (${s.lastErrorReason})`,
            status: 'open'
        }));
        res.json({ ok: true, alerts });
    } catch (err) {
        res.status(500).json({ ok: false, message: 'Failed to fetch alerts' });
    }
});

module.exports = router;
