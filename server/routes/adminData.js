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

router.get('/ai-usage', async (req, res) => {
    try {
        const { inMemoryMetrics, getDisplayAiCallsToday } = require('../lib/presenter');
        const DisplayMetrics = require('../models/DisplayMetrics');
        const today = new Date().toISOString().split('T')[0];
        
        let dbMetrics = null;
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState === 1) {
            dbMetrics = await DisplayMetrics.findOne({ date: today }).lean();
        }

        const algoSummaries = (dbMetrics?.algoSummaries || 0) + inMemoryMetrics.algoSummaries;
        const aiSummaries = (dbMetrics?.aiSummaries || 0) + inMemoryMetrics.aiSummaries;
        const totalSummaries = algoSummaries + aiSummaries || 1;
        const cacheHits = (dbMetrics?.cacheHits || 0) + inMemoryMetrics.cacheHits;
        const cacheMisses = (dbMetrics?.cacheMisses || 0) + inMemoryMetrics.cacheMisses;
        const totalCacheReqs = cacheHits + cacheMisses || 1;
        const cacheHitRate = ((cacheHits / totalCacheReqs) * 100).toFixed(1) + '%';
        const displayAiCallsToday = await getDisplayAiCallsToday();

        const rejections = (dbMetrics?.rejections || 0) + inMemoryMetrics.rejections;
        const rejectionReasons = [
            ...(dbMetrics?.rejectionReasons || []),
            ...inMemoryMetrics.rejectionReasons
        ].slice(-20);

        res.json({
            ok: true,
            callsToday: 15,
            dailyCap: 1500,
            quotaExhausted: false,
            callsSavedByHashing: 34,
            displayMonitoring: {
                summariesByEngine: {
                    algorithm: algoSummaries,
                    ai: aiSummaries,
                    algorithmShare: ((algoSummaries / totalSummaries) * 100).toFixed(1) + '%',
                    aiShare: ((aiSummaries / totalSummaries) * 100).toFixed(1) + '%'
                },
                cacheHitRate,
                cacheHits,
                cacheMisses,
                rejections,
                rejectionReasons,
                displayAiCallsToday
            }
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
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
