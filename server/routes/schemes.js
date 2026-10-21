const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Scheme = require('../models/Scheme');
const { presentScheme } = require('../lib/presenter');
const { getLeanSchemes } = require('../lib/schemesCache');

// GET all approved schemes (lean, cached in-memory, ETag enabled)
router.get('/', async (req, res) => {
    try {
        const { jsonString, etag } = await getLeanSchemes(Scheme);

        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');

        if (req.headers['if-none-match'] === etag) {
            return res.status(304).end();
        }

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.send(jsonString);
    } catch (err) {
        console.error('[SchemesRouter] GET / error:', err.message);
        res.status(500).json({ message: err.message });
    }
});

// GET /api/schemes/:id - Full details endpoint (includes facts, quotes, snapshots, logs, change history)
router.get('/:id', async (req, res, next) => {
    // If route matches /:id/display, let next route handle it
    if (req.params.id === 'display') return next();

    try {
        const { id } = req.params;
        let scheme = null;

        if (mongoose.Types.ObjectId.isValid(id)) {
            scheme = await Scheme.findById(id).lean();
        }
        if (!scheme) {
            scheme = await Scheme.findOne({
                $or: [
                    { name: id },
                    { name: new RegExp('^' + id + '$', 'i') }
                ]
            }).lean();
        }

        if (!scheme) {
            return res.status(404).json({ error: 'Scheme not found' });
        }

        // Attach facts with quotes if present
        let facts = [];
        try {
            const Fact = require('../models/Fact');
            facts = await Fact.find({ schemeId: scheme._id }).lean();
        } catch (_) {}

        res.json({
            ...scheme,
            facts
        });
    } catch (err) {
        console.error('[SchemesRouter] Details endpoint error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/schemes/:id/display - Return presentation layer details
router.get('/:id/display', async (req, res) => {
    try {
        const { id } = req.params;
        const { lang = 'en', level = 'simple', mode = null } = req.query;

        let scheme;
        if (mongoose.Types.ObjectId.isValid(id)) {
            scheme = await Scheme.findById(id);
        }
        if (!scheme) {
            // Support lookup by name if not an ObjectId
            scheme = await Scheme.findOne({
                $or: [
                    { name: id },
                    { name: new RegExp('^' + id + '$', 'i') }
                ]
            });
        }

        if (!scheme) {
            return res.status(404).json({ error: 'Scheme not found' });
        }

        const presentation = await presentScheme({
            scheme,
            lang,
            level,
            mode
        });

        res.json(presentation);
    } catch (err) {
        console.error('[SchemesRouter] Display endpoint error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/schemes - Save or update a scheme in the database
router.post('/', async (req, res) => {
    try {
        const { invalidateCache } = require('../lib/schemesCache');
        const data = req.body;
        if (!data || !data.name) {
            return res.status(400).json({ error: 'Scheme name is required' });
        }

        const query = { name: new RegExp('^' + data.name.trim() + '$', 'i') };
        const updateData = {
            name: data.name.trim(),
            nameTamil: data.nameTamil || '',
            category: data.category || 'General',
            benefit: data.benefit || '',
            status: data.status || 'ACTIVE',
            rules: data.rules || {},
            unmappedCriteria: Array.isArray(data.unmappedCriteria) ? data.unmappedCriteria : [],
            requiredDocuments: Array.isArray(data.requiredDocuments) ? data.requiredDocuments : [],
            howToApply: Array.isArray(data.howToApply) ? data.howToApply : [],
            officialLinks: data.officialLinks || [],
            reviewStatus: 'approved',
            verify: true,
            displayState: 'confirmed',
            verificationStatus: 'confirmed',
            lastVerified: new Date().toISOString()
        };

        const scheme = await Scheme.findOneAndUpdate(query, updateData, {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
        });

        // Invalidate in-memory cache so GET /api/schemes serves the updated list immediately
        invalidateCache();

        res.status(200).json({ ok: true, scheme });
    } catch (err) {
        console.error('[SchemesRouter] POST / error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
