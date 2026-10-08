const express = require('express');
const router = express.Router();
const Scheme = require('../models/Scheme');
const Source = require('../models/Source');
const Fact = require('../models/Fact');
const apicache = require('apicache');

const cache = apicache.middleware('30 seconds');

// Helper to remove sensitive fields
const sanitizeSource = (doc) => {
    const obj = doc.toObject ? doc.toObject() : doc;
    delete obj.rawHtml;
    delete obj.__v;
    return obj;
};

router.get('/summary', cache, async (req, res) => {
    try {
        const totalSchemes = await Scheme.countDocuments();
        const verifiedSchemes = await Scheme.countDocuments({ verificationStatus: 'verified' });
        const announcedSchemes = await Scheme.countDocuments({ status: 'announced' });
        const pendingSchemes = await Scheme.countDocuments({ reviewStatus: 'pending' });
        
        // Mock CrawlerJob count for 'awaiting_extraction'
        const CrawlerJob = require('../models/CrawlerJob');
        const awaitingAIChecks = await CrawlerJob.countDocuments({ status: 'awaiting_extraction' });
        
        // Mock facts by method for monitoring
        const aiFacts = await Fact.countDocuments({ extractedBy: 'ai' });
        const ruleFacts = await Fact.countDocuments({ extractedBy: 'rules' });
        const selectorFacts = await Fact.countDocuments({ extractedBy: 'selector' });
        const regexFacts = await Fact.countDocuments({ extractedBy: 'regex' });
        
        const totalFacts = aiFacts + ruleFacts + selectorFacts + regexFacts || 1; // avoid division by zero
        
        const sourcesConfig = require('../sources.json');
        const sourcesCount = sourcesConfig.officialPages.length;
        const errorSources = sourcesConfig.officialPages.filter(s => s.lastErrorReason).length;
        const workingSources = sourcesCount - errorSources;

        res.json({
            ok: true,
            lastChecked: new Date(),
            counts: {
                totalSchemes,
                verifiedSchemes,
                announcedSchemes,
                pendingSchemesFound: pendingSchemes
            },
            sourceHealth: {
                total: sourcesCount,
                working: workingSources,
                errors: errorSources
            },
            extractionMethods: {
                ai: ((aiFacts / totalFacts) * 100).toFixed(1) + '%',
                rules: ((ruleFacts / totalFacts) * 100).toFixed(1) + '%',
                selector: ((selectorFacts / totalFacts) * 100).toFixed(1) + '%',
                regex: ((regexFacts / totalFacts) * 100).toFixed(1) + '%'
            },
            awaitingAIChecks
        });
    } catch (err) {
        res.status(500).json({ ok: false, message: 'Failed to fetch summary' });
    }
});

router.get('/sources', cache, async (req, res) => {
    try {
        const sourcesConfig = require('../sources.json');
        const sources = sourcesConfig.officialPages.map(s => ({
            _id: s.domain,
            domain: s.domain,
            name: s.name,
            url: s.url,
            healthStatus: s.lastErrorReason ? 'error' : 'working',
            lastErrorReason: s.lastErrorReason || null,
            trustLevel: 'official',
            // Mock source-level extraction stats
            extractionMethods: {
                ai: '15%',
                rules: '40%',
                selector: '35%',
                regex: '10%'
            }
        }));
        res.json({ ok: true, sources });
    } catch (err) {
        res.status(500).json({ ok: false, message: 'Failed to fetch sources' });
    }
});

router.get('/schemes', cache, async (req, res) => {
    try {
        const schemes = await Scheme.find({ reviewStatus: { $ne: 'pending' } })
            .select('name nameTamil category status verificationStatus lastVerified')
            .lean();
        res.json({ ok: true, schemes });
    } catch (err) {
        res.status(500).json({ ok: false, message: 'Failed to fetch schemes' });
    }
});

router.get('/schemes/:id/evidence', cache, async (req, res) => {
    try {
        const facts = await Fact.find({ schemeId: req.params.id }).sort('-fetchedAt').lean();
        res.json({ ok: true, facts });
    } catch (err) {
        res.status(500).json({ ok: false, message: 'Failed to fetch evidence' });
    }
});

module.exports = router;
