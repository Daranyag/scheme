const crypto = require('crypto');
const Scheme = require('../models/Scheme');
const sourcesConfig = require('../sources.json');
const { fetchPage } = require('../lib/fetcher');
const { extractSchemeInformation, runGroundedSearch } = require('../lib/gemini');
const { checkLinks } = require('../services/linkChecker');
const { isAllowlistedUrl } = require('../config/allowlist');

// Global unhandled error safety handlers (server stability)
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception caught:', err.message, err.stack);
});

// Job execution lock
let isJobRunning = false;

/**
 * Calculates SHA256 content hash of string
 */
function calculateContentHash(text) {
  if (!text) return '';
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Runs the robust, un-crashable verification job on all scheme records.
 */
async function runVerificationJob(options = {}) {
  if (isJobRunning) {
    console.log('[JobRunner] Verification job is already running. Skipping concurrent run.');
    return [];
  }

  isJobRunning = true;
  console.log('[JobRunner] Starting live verification job...');
  const report = [];

  try {
    let query = {};
    if (options.schemeFilter) {
      query = {
        $or: [
          { name: { $regex: options.schemeFilter, $options: 'i' } },
          { schemeName: { $regex: options.schemeFilter, $options: 'i' } },
          { category: { $regex: options.schemeFilter, $options: 'i' } }
        ]
      };
    }
    const schemes = await Scheme.find(query);
    console.log(`Expected Gemini calls: up to ${schemes.length} call(s) (1 per scheme with fetched/changed pages).`);

    for (const scheme of schemes) {
      try {
        const itemReport = await verifySingleScheme(scheme);
        report.push(itemReport);
      } catch (schemeErr) {
        console.error(`[JobRunner] Individual scheme error for "${scheme.name}":`, schemeErr.message);
        report.push({
          id: scheme._id,
          name: scheme.name || 'Unnamed Scheme',
          status: 'unreachable',
          errorType: 'connection_refused',
          reason: `System error: ${schemeErr.message}`,
          lastVerified: scheme.lastVerified
        });
      }

      // 1.5s delay between scheme processing
      await new Promise(r => setTimeout(r, 1500));
    }

  } catch (jobErr) {
    console.error('[JobRunner] Global job runner exception:', jobErr.message);
  } finally {
    isJobRunning = false;
    console.log('[JobRunner] Verification job run completed.');
  }

  return report;
}

/**
 * Verifies a single scheme record safely without throwing.
 */
async function verifySingleScheme(scheme) {
  const schemeName = (scheme.name || scheme.schemeName || scheme.category || `Government Scheme ${scheme._id}`).toString();
  console.log(`[JobRunner] Processing scheme: "${schemeName}"`);

  // Candidate Collection
  const rawCandidates = [];

  // (a) officialLinks / links
  const selfLinks = scheme.officialLinks || scheme.links || [];
  for (const item of selfLinks) {
    let u = '';
    if (Array.isArray(item)) u = item[1];
    else if (typeof item === 'object' && item !== null) u = item.url || item.link;
    else if (typeof item === 'string') u = item;
    if (u) rawCandidates.push(u);
  }

  // (b) sources.json entries
  for (const page of sourcesConfig.officialPages || []) {
    if (page.schemes && page.schemes.some(s => s && (s.toLowerCase() === schemeName.toLowerCase() || schemeName.toLowerCase().includes(s.toLowerCase())))) {
      rawCandidates.push(page.url);
    }
  }

  // (c) Grounded Lookup via Gemini + Google Search (if API key available)
  if (process.env.GEMINI_API_KEY) {
    try {
      const searchRes = await runGroundedSearch({
        prompt: `Find official government portal URL for scheme "${schemeName}" in Tamil Nadu.`
      });
      const chunks = searchRes.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      for (const chunk of chunks) {
        if (chunk.web?.uri && isAllowlistedUrl(chunk.web.uri)) {
          rawCandidates.push(chunk.web.uri);
        }
      }
    } catch (err) {
      console.log(`[JobRunner] Grounding lookup skipped for ${schemeName}: ${err.message}`);
    }
  }

  const uniqueCandidates = Array.from(new Set(rawCandidates));
  const allowlistedCandidates = uniqueCandidates.filter(u => isAllowlistedUrl(u));

  let finalStatus = 'no_candidate_page';
  let errorType = null;
  let failureReason = 'no candidate link';
  let selectedPageUrl = null;
  let fetchResult = null;
  let certExpiryDate = null;

  if (uniqueCandidates.length === 0) {
    finalStatus = 'no_candidate_page';
    failureReason = 'no candidate link';
  } else if (allowlistedCandidates.length === 0) {
    finalStatus = 'blocked';
    errorType = 'blocked_domain';
    failureReason = 'domain not allowed';
  } else {
    // Attempt candidate fetches
    for (const candidateUrl of allowlistedCandidates) {
      fetchResult = await fetchPage(candidateUrl);
      selectedPageUrl = candidateUrl;

      if (fetchResult.ok && fetchResult.text) {
        break;
      }

      errorType = fetchResult.errorType;

      if (fetchResult.errorType === 'tls_expired' || fetchResult.errorType === 'tls_other') {
        finalStatus = 'tls_problem';
        certExpiryDate = fetchResult.certInfo?.validTo || null;
        failureReason = `TLS certificate error (${fetchResult.errorType})`;
        break;
      } else if (fetchResult.errorType === 'blocked_robots' || fetchResult.errorType === 'blocked_domain') {
        finalStatus = 'blocked';
        failureReason = fetchResult.errorMessage || 'blocked';
      } else {
        finalStatus = 'unreachable';
        failureReason = fetchResult.errorMessage || `fetch failed (${fetchResult.errorType || fetchResult.status})`;
      }
    }
  }

  let changeEntries = [];
  let differencesFound = [];

  if (fetchResult && fetchResult.ok && fetchResult.text) {
    const newContentHash = calculateContentHash(fetchResult.text);

    // Idempotency: Check if content hash is unchanged
    if (scheme.contentHash && scheme.contentHash === newContentHash && scheme.verificationStatus === 'verified') {
      console.log(`[JobRunner] Scheme "${schemeName}" content hash unchanged. Skipping re-extraction.`);
      return {
        id: scheme._id,
        name: schemeName,
        status: scheme.verificationStatus || 'verified',
        verificationStatus: scheme.verificationStatus || 'verified',
        verificationReason: 'content unchanged',
        verificationLevel: scheme.verificationLevel || 'official',
        pageUsed: scheme.pageUsed || fetchResult.finalUrl,
        lastVerified: scheme.lastVerified,
        differencesFound: ['None'],
        sources: [scheme.pageUsed || fetchResult.finalUrl],
        linkStatus: (scheme.verifiedLinks || []).map(l => ({ title: l.title, url: l.url, linkStatus: l.linkStatus || 'ok', working: l.working }))
      };
    }

    // Call Gemini extraction module
    const aiResult = await extractSchemeInformation(schemeName, fetchResult.text);

    if (!aiResult.ok && aiResult.errorType === 'ai_unavailable') {
      finalStatus = 'ai_unavailable';
      failureReason = 'retry later';
      scheme.retryCount = (scheme.retryCount || 0) + 1;
      if (scheme.retryCount <= 5) {
        scheme.retryAfter = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      }
    } else if (aiResult.ok && aiResult.data) {
      const extractedData = aiResult.data;
      const pageUsed = fetchResult.finalUrl || selectedPageUrl;

      // Compare Benefit
      if (extractedData.benefit && extractedData.benefit !== scheme.benefit) {
        differencesFound.push('Benefit text differs');
        changeEntries.push({
          field: 'benefit',
          oldValue: scheme.benefit,
          newValue: extractedData.benefit,
          quote: extractedData.quote || 'Extracted from official portal text',
          source: pageUsed,
          date: new Date()
        });
        scheme.benefit = extractedData.benefit;
      }

      // Compare Docs
      if (extractedData.docs && Array.isArray(extractedData.docs) && extractedData.docs.length > 0) {
        if (JSON.stringify(extractedData.docs) !== JSON.stringify(scheme.docs)) {
          changeEntries.push({
            field: 'docs',
            oldValue: scheme.docs,
            newValue: extractedData.docs,
            quote: 'Document checklist updated from official page',
            source: pageUsed,
            date: new Date()
          });
          scheme.docs = extractedData.docs;
        }
      }

      if (changeEntries.length > 0) {
        scheme.changedRecently = true;
        const thirtyDays = new Date();
        thirtyDays.setDate(thirtyDays.getDate() + 30);
        scheme.changedRecentlyUntil = thirtyDays;
        scheme.changeHistory.push(...changeEntries);
        finalStatus = 'differs';
        scheme.verificationLevel = 'differs';
        failureReason = 'verified with updates';
      } else {
        finalStatus = 'verified';
        scheme.verificationLevel = 'official';
        failureReason = 'verified';
      }

      scheme.contentHash = newContentHash;
      scheme.pageUsed = pageUsed;
      scheme.retryCount = 0;
      scheme.retryAfter = null;
    } else {
      finalStatus = 'unreachable';
      failureReason = aiResult.errorType ? `extraction failed (${aiResult.errorType})` : 'extraction failed';
    }
  }

  // Check scheme links
  const linkInputList = scheme.officialLinks || scheme.links || [];
  const linkResults = await checkLinks(linkInputList);
  scheme.verifiedLinks = linkResults;

  // Preserve stored data on failure
  if (finalStatus === 'verified' || finalStatus === 'differs') {
    scheme.verificationStatus = finalStatus;
    scheme.verificationReason = failureReason;
    scheme.lastVerified = new Date().toISOString();
  } else {
    // Keep last good data, set classified status
    scheme.verificationStatus = finalStatus;
    scheme.verificationReason = failureReason;
  }

  await scheme.save();

  return {
    id: scheme._id,
    name: schemeName,
    status: finalStatus,
    verificationStatus: finalStatus,
    verificationReason: failureReason,
    verificationLevel: scheme.verificationLevel || 'secondary-source',
    errorType: errorType || (fetchResult ? fetchResult.errorType : null),
    pageUsed: scheme.pageUsed || null,
    certExpiryDate,
    lastVerified: scheme.lastVerified,
    changedRecently: scheme.changedRecently || false,
    differencesFound: differencesFound.length > 0 ? differencesFound : ['None'],
    sources: scheme.pageUsed ? [scheme.pageUsed] : (selectedPageUrl ? [selectedPageUrl] : ['Local / Secondary Sources']),
    linkStatus: linkResults.map(l => ({
      title: l.title,
      url: l.url,
      linkStatus: l.linkStatus,
      httpStatus: l.httpStatus,
      checkedAt: l.checkedAt,
      isAllowlisted: l.isAllowlisted,
      working: l.working,
      reason: l.reason
    }))
  };
}

module.exports = {
  runVerificationJob,
  verifySingleScheme,
  calculateContentHash
};
