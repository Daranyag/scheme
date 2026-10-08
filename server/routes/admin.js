const express = require('express');
const router = express.Router();
const Scheme = require('../models/Scheme');
const { runVerificationJob } = require('../services/verificationJob');
const { runLiveCrawler } = require('../services/crawlerService');
const sourcesConfig = require('../sources.json');

// Middleware to check ADMIN_KEY from header (x-admin-key) or query (admin_key)
const adminAuth = (req, res, next) => {
  const key = req.headers['x-admin-key'] || req.query.admin_key;
  const adminKey = process.env.ADMIN_KEY || 'your_secret_admin_key';
  
  if (!key || key !== adminKey) {
    return res.status(401).json({ error: 'Unauthorized. Invalid or missing ADMIN_KEY.' });
  }
  next();
};

// GET /api/admin/pending - List pending records with extracted fields next to raw source text
router.get('/pending', adminAuth, async (req, res) => {
  try {
    const pendingSchemes = await Scheme.find({ reviewStatus: 'pending' });
    
    const formatted = pendingSchemes.map(s => ({
      id: s._id,
      name: s.name,
      nameTamil: s.nameTamil,
      category: s.category,
      benefit: s.benefit,
      eligibilityRules: s.eligibilityRules || {},
      unmappedCriteria: s.unmappedCriteria || [],
      requiredDocuments: s.requiredDocuments || s.docs || [],
      howToApply: s.howToApply || s.steps || [],
      officialLinks: s.officialLinks || s.links || [],
      sourceUrl: s.sourceUrl,
      origin: s.origin,
      fetchedAt: s.fetchedAt,
      rawSourceText: s.rawSourceText || 'No source text cached.',
      reviewStatus: s.reviewStatus
    }));

    res.json({
      count: formatted.length,
      pendingSchemes: formatted
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/schemes/:id/review - Approve or Reject a pending record
router.patch('/schemes/:id/review', adminAuth, async (req, res) => {
  try {
    const { action, renamedFrom, replacedBy } = req.body; // action: "approve" | "reject"
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be "approve" or "reject".' });
    }

    const scheme = await Scheme.findById(req.params.id);
    if (!scheme) {
      return res.status(404).json({ error: 'Scheme record not found.' });
    }

    scheme.reviewStatus = action === 'approve' ? 'approved' : 'rejected';
    if (renamedFrom) scheme.renamedFrom = renamedFrom;
    if (replacedBy) scheme.replacedBy = replacedBy;

    await scheme.save();

    res.json({
      message: `Scheme "${scheme.name}" successfully ${scheme.reviewStatus}.`,
      scheme
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/refresh - Run live crawler on demand
router.post('/refresh', adminAuth, async (req, res) => {
  try {
    const results = await runLiveCrawler();
    res.json({
      message: 'On-demand crawl completed successfully.',
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/verification-report
router.get('/verification-report', adminAuth, async (req, res) => {
  try {
    const schemes = await Scheme.find();
    
    const recordsReport = schemes.map(s => {
      const historySummary = (s.changeHistory || []).map(h => ({
        field: h.field,
        oldValue: h.oldValue,
        newValue: h.newValue,
        quote: h.quote,
        source: h.source,
        date: h.date
      }));

      return {
        id: s._id,
        name: s.name,
        verificationStatus: s.verificationStatus || (s.verificationLevel === 'official' ? 'verified' : (s.verificationLevel === 'differs' ? 'differs' : 'unreachable')),
        verificationReason: s.verificationReason || 'no candidate link',
        verificationLevel: s.verificationLevel || 'secondary-source',
        pageUsed: s.pageUsed || null,
        lastVerified: s.lastVerified,
        reviewStatus: s.reviewStatus || 'approved',
        origin: s.origin || 'starter',
        changedRecently: s.changedRecently || false,
        differencesFound: historySummary.length > 0 ? historySummary : ['None'],
        sources: s.pageUsed ? [s.pageUsed] : (s.sourceUrl ? [s.sourceUrl] : ['Local / Secondary Sources']),
        linkStatus: (s.verifiedLinks || []).map(l => ({
          title: l.title,
          url: l.url,
          linkStatus: l.linkStatus || (l.working ? 'ok' : '404'),
          httpStatus: l.httpStatus !== undefined ? l.httpStatus : null,
          checkedAt: l.checkedAt || l.verifiedAt || new Date().toISOString(),
          isAllowlisted: l.isAllowlisted !== false,
          working: l.working !== false,
          reason: l.reason || ''
        }))
      };
    });

    res.json({
      timestamp: new Date().toISOString(),
      totalRecords: schemes.length,
      pendingCount: schemes.filter(s => s.reviewStatus === 'pending').length,
      allowlistedDomains: sourcesConfig.allowlistedDomains,
      excludedSourcesReport: sourcesConfig.excludedSourcesReport || [],
      records: recordsReport
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/verify (Run verifier on demand)
router.post('/verify', adminAuth, async (req, res) => {
  try {
    const report = await runVerificationJob();
    res.json({
      message: 'On-demand verification completed successfully.',
      report
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const mongoose = require('mongoose');
const DiscoveryJob = require('../models/DiscoveryJob');

// GET /api/admin/discovery-logs
router.get('/discovery-logs', adminAuth, async (req, res) => {
  try {
    let jobs = [];
    if (mongoose.connection.readyState === 1) {
      jobs = await DiscoveryJob.find().sort({ updatedAt: -1 });
    }

    res.json({
      count: jobs.length,
      discoveryLogs: jobs.map(j => ({
        id: j._id,
        deviceId: j.deviceId,
        profileSync: j.profileSync,
        status: j.status,
        attempts: j.attempts,
        lastRunAt: j.lastRunAt,
        nextRunAt: j.nextRunAt,
        lockedAt: j.lockedAt,
        logs: j.logs
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const { getQuotaAndBudgetStatus } = require('../lib/gemini');

// GET /api/admin/ai-usage
router.get('/ai-usage', adminAuth, async (req, res) => {
  try {
    const status = await getQuotaAndBudgetStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
