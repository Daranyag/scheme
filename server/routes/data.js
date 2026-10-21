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

const { evaluateSource } = require('../lib/sourceEvaluator');

router.get('/summary', cache, async (req, res) => {
    try {
        const totalSchemes = await Scheme.countDocuments();
        const pendingSchemes = await Scheme.countDocuments({ reviewStatus: 'pending' });
        const announcedSchemes = await Scheme.countDocuments({ status: 'announced' });

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const fetchedTodayCount = await Scheme.countDocuments({
            fetchedAt: { $gte: startOfToday }
        });
        const alreadyIndexedCount = Math.max(0, totalSchemes - fetchedTodayCount);

        const recentlyFetchedToday = await Scheme.find({
            fetchedAt: { $gte: startOfToday }
        })
        .select('name department category fetchedAt origin reviewStatus')
        .sort('-fetchedAt')
        .limit(10)
        .lean();

        // Quoted facts count check
        const validFacts = await Fact.find({
            quote: { $exists: true, $ne: '' },
            rejected: { $ne: true }
        }).lean();
        const schemeIdsWithFacts = new Set(validFacts.map(f => f.schemeId.toString()));
        const confirmedSchemes = await Scheme.countDocuments({
            _id: { $in: Array.from(schemeIdsWithFacts) },
            reviewStatus: 'approved'
        });

        // Schemes needing better recipe or parsing
        const needsRecipeCount = await Scheme.countDocuments({
            $or: [
                { verificationStatus: 'fetched_not_parsed' },
                { completenessScore: { $lt: 80 } }
            ]
        });

        // Facts by method for monitoring
        const aiFacts = await Fact.countDocuments({ extractedBy: 'ai', rejected: { $ne: true } });
        const ruleFacts = await Fact.countDocuments({ extractedBy: 'rules', rejected: { $ne: true } });
        const selectorFacts = await Fact.countDocuments({ extractedBy: 'selector', rejected: { $ne: true } });
        const regexFacts = await Fact.countDocuments({ extractedBy: 'regex', rejected: { $ne: true } });

        const totalFacts = aiFacts + ruleFacts + selectorFacts + regexFacts || 1;

        const sourcesConfig = require('../sources.json');
        const evaluated = sourcesConfig.officialPages.map(s => evaluateSource(s));
        const sourcesCount = evaluated.length;
        const workingSources = evaluated.filter(s => s.healthStatus === 'Working').length;
        const errorSources = sourcesCount - workingSources;

        res.json({
            ok: true,
            lastChecked: new Date(),
            counts: {
                totalSchemes,
                verifiedSchemes: confirmedSchemes,
                announcedSchemes,
                pendingSchemesFound: pendingSchemes,
                needsRecipe: needsRecipeCount,
                fetchedToday: fetchedTodayCount,
                alreadyIndexed: alreadyIndexedCount
            },
            todayActivity: {
                fetchedToday: fetchedTodayCount,
                alreadyIndexed: alreadyIndexedCount,
                recentlyFetched: recentlyFetchedToday
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
            needsRecipeCount
        });
    } catch (err) {
        res.status(500).json({ ok: false, message: 'Failed to fetch summary' });
    }
});

router.get('/sources', cache, async (req, res) => {
    try {
        const sourcesConfig = require('../sources.json');
        const sources = sourcesConfig.officialPages.map(s => {
            const ev = evaluateSource(s);
            return {
                _id: ev.domain || s.url,
                domain: ev.domain,
                name: ev.name,
                url: ev.url,
                healthStatus: ev.healthStatus,
                lastSuccessAt: ev.lastSuccessAt,
                lastErrorReason: ev.lastErrorReason,
                trustLevel: ev.trustLevel,
                bytes: ev.bytes
            };
        });
        res.json({ ok: true, sources });
    } catch (err) {
        res.status(500).json({ ok: false, message: 'Failed to fetch sources' });
    }
});

router.get('/schemes', cache, async (req, res) => {
    try {
        const schemes = await Scheme.find()
            .select('name nameTamil category department status verificationStatus lastVerified origin reviewStatus')
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

// Systematic Truthful Coverage Endpoint
router.get('/coverage', cache, async (req, res) => {
    try {
        const { KNOWN_DEPARTMENTS } = require('../services/coverageService');

        const allSchemes = await Scheme.find().lean();
        const validFacts = await Fact.find({
            quote: { $exists: true, $ne: '' },
            rejected: { $ne: true }
        }).lean();

        const factsByScheme = {};
        for (const f of validFacts) {
            const sid = f.schemeId.toString();
            factsByScheme[sid] = (factsByScheme[sid] || 0) + 1;
        }

        for (const s of allSchemes) {
            s.hasQuotedFacts = (factsByScheme[s._id.toString()] || 0) > 0;
            s.isConfirmed = s.reviewStatus === 'approved' && s.hasQuotedFacts;
        }

        const counts = {
            starter: allSchemes.filter(s => s.origin === 'starter').length,
            confirmed: allSchemes.filter(s => s.isConfirmed).length,
            pending: allSchemes.filter(s => s.reviewStatus === 'pending').length,
            rejected: allSchemes.filter(s => s.reviewStatus === 'rejected').length
        };

        const departments = KNOWN_DEPARTMENTS.map((dept) => {
            const deptSchemes = allSchemes.filter(s => s.department === dept.name);
            const indexedSchemes = deptSchemes.filter(s => s.isConfirmed);
            const schemesCount = indexedSchemes.length; // strictly from real records with quoted facts

            const siteEval = evaluateSource({ url: dept.site, name: dept.name });
            const workingSite = siteEval.healthStatus === 'Working';
            const hasGap = schemesCount === 0;

            let gapReason = null;
            if (hasGap) {
                if (siteEval.healthStatus === 'Certificate problem') {
                    gapReason = 'Official site certificate problem; no verified records with quoted facts';
                } else if (siteEval.healthStatus === 'Slow') {
                    gapReason = 'Official site response timed out; no verified records with quoted facts';
                } else if (siteEval.healthStatus === 'Needs JavaScript') {
                    gapReason = 'Official portal requires JavaScript rendering; no quoted facts extracted';
                } else if (siteEval.healthStatus === 'Not checked yet') {
                    gapReason = 'Department portal not yet crawled; 0 schemes indexed';
                } else if (deptSchemes.length > 0 && deptSchemes.every(s => s.reviewStatus === 'rejected')) {
                    gapReason = 'Candidate records rejected during audit (0 quoted facts on official site)';
                } else {
                    gapReason = 'No official schemes indexed with quoted facts yet';
                }
            }

            return {
                id: dept.id,
                department: dept.name,
                category: dept.category,
                website: dept.site,
                workingSite,
                siteStatus: siteEval.healthStatus,
                schemesCount,
                starterCount: deptSchemes.filter(s => s.origin === 'starter').length,
                confirmedCount: indexedSchemes.length,
                pendingCount: deptSchemes.filter(s => s.reviewStatus === 'pending').length,
                rejectedCount: deptSchemes.filter(s => s.reviewStatus === 'rejected').length,
                hasGap,
                gapReason
            };
        });

        const gaps = departments.filter(d => d.hasGap).map(d => ({
            id: d.id,
            department: d.department,
            reason: d.gapReason
        }));

        res.json({
            ok: true,
            lastChecked: new Date(),
            counts,
            totalDepartments: departments.length,
            workingSites: departments.filter(d => d.workingSite).length,
            schemesIndexed: departments.reduce((sum, d) => sum + d.schemesCount, 0),
            gapsCount: gaps.length,
            gaps,
            departments
        });
    } catch (err) {
        res.status(500).json({ ok: false, message: 'Failed to fetch coverage' });
    }
});

// Trigger live fetch of official government schemes from tn.gov.in/scheme_wise.php
router.all('/fetch-official', async (req, res) => {
    try {
        const { fetchAndStoreOfficialGovSchemes } = require('../services/officialGovSchemeFetcher');
        const limit = parseInt(req.query.limit || req.body.limit || '15', 10);
        const results = await fetchAndStoreOfficialGovSchemes(limit);
        apicache.clear();
        res.json({
            ok: true,
            message: 'Official government schemes successfully fetched and stored in database.',
            results
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// User custom TN URL fetch (strictly Tamil Nadu government sources only)
router.post('/fetch-custom', async (req, res) => {
    try {
        const { targetUrl } = req.body;
        const { fetchFromCustomSource, isTamilNaduGovUrl } = require('../services/officialGovSchemeFetcher');
        
        if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.trim()) {
            return res.status(400).json({ ok: false, error: 'Target URL is required.' });
        }

        const trimmedUrl = targetUrl.trim();
        if (!isTamilNaduGovUrl(trimmedUrl)) {
            return res.status(400).json({
                ok: false,
                error: 'Restricted: Only official Tamil Nadu Government portals (*.tn.gov.in, *.nic.in, cmchistn.com, tnesevai, karuvoolam, etc.) can be fetched.'
            });
        }

        const results = await fetchFromCustomSource(trimmedUrl);
        apicache.clear();
        res.json({
            ok: true,
            message: `Successfully fetched schemes from official TN source: ${trimmedUrl}`,
            results
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Fetch from all configured official sources
router.post('/fetch-all-sources', async (req, res) => {
    try {
        const { fetchFromAllOfficialSources } = require('../services/officialGovSchemeFetcher');
        const results = await fetchFromAllOfficialSources();
        apicache.clear();
        res.json({
            ok: true,
            message: `Fetched across all official Tamil Nadu sources (${results.totalSources} sources).`,
            results
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;

