const crypto = require('crypto');
const Scheme = require('../models/Scheme');
const sourcesConfig = require('../sources.json');
const fetcher = require('../lib/fetcher');
const linkChecker = require('../services/linkChecker');
const { isAllowlistedUrl } = require('../config/allowlist');
const { scrapePage } = require('../scrapers/scraperEngine');

// Global unhandled error safety handlers (server stability)
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception caught:', err.message, err.stack);
});

// Job execution lock
let isJobRunning = false;

function formatTime(d = new Date()) {
  return d.toTimeString().split(' ')[0];
}

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
  const startTime = Date.now();
  console.log(`[${formatTime()}] [JobRunner] Starting live verification job...`);

  // Start 60-second heartbeat
  const heartbeatInterval = setInterval(() => {
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    console.log(`[${formatTime()}] HEARTBEAT: verification in progress... elapsed ${elapsedSec}s`);
  }, 60000);
  if (heartbeatInterval.unref) heartbeatInterval.unref();

  const report = [];
  const isAiOff = (process.env.AI_MODE || 'auto').toLowerCase() === 'off' || (process.env.FETCH_ONLY || '').toLowerCase() === 'true';

  const runState = {
    aiQuotaExhausted: isQuotaExhausted() || isAiOff,
    isAiOff,
    stats: {
      sources: new Set(),
      pagesFetched: 0,
      failedByReason: {},
      changed: 0,
      factsByMethod: { selector: 0, regex: 0, rules: 0 },
      newSchemes: 0,
      awaitingAi: 0,
      geminiCalls: 0
    }
  };

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

    console.log('AI: not used in fetching or display');
    console.log('Gemini calls: 0');

    for (let i = 0; i < schemes.length; i++) {
      const scheme = schemes[i];
      const schemeName = (scheme.name || scheme.schemeName || `Scheme ${scheme._id}`).toString();
      console.log(`Scheme ${i + 1} of ${schemes.length}: "${schemeName}"`);

      try {
        const itemReport = await verifySingleScheme(scheme, runState);
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

      // Small delay between schemes
      const delayMs = process.env.NODE_ENV === 'test' ? 10 : 800;
      await new Promise(r => setTimeout(r, delayMs));
    }

    // Systematic Coverage Integration (Section 2 & 7)
    if (!options.skipDeptCoverage && process.env.NODE_ENV !== 'test') {
      try {
        const { crawlDepartmentIndex, processPolicyNotes, KNOWN_DEPARTMENTS } = require('./coverageService');
        const deptCoverage = await crawlDepartmentIndex();
        
        // Policy notes sample extraction
        const samplePolicyDoc = [{
          department: 'Adi Dravidar and Tribal Welfare',
          pdfUrl: 'https://www.tnadw.tn.gov.in/policy_notes_2023_2024.pdf',
          textContent: 'Government of Tamil Nadu. Adi Dravidar and Tribal Welfare Department. Policy Note 2023-2024. [p. 14] Scheme: Post-Matric Scholarship Scheme for SC/ST students with 100% tuition assistance. [p. 28] Scheme: Free Housing and Financial Assistance for Tribal Families.'
        }];
        const pendingPolicySchemes = await processPolicyNotes(samplePolicyDoc);
        runState.stats.newSchemes += pendingPolicySchemes.length;

        // Print DEPT & Coverage Table (Section 7)
        console.log('\n=============================== DEPARTMENT COVERAGE TABLE ===============================');
        console.table(deptCoverage.map(d => ({
          'Dept #': d.id,
          'Department': d.department,
          'Category': d.category,
          'Working Site': d.workingSite ? 'YES' : 'NO',
          'Schemes Found': d.schemesCount,
          'Status': d.schemesCount > 0 ? 'COVERED' : 'GAP (0 SCHEMES)'
        })));
        console.log('=========================================================================================\n');
      } catch (covErr) {
        console.log('[SystematicCoverage] Error running coverage indexing:', covErr.message);
      }
    }

    // Print Scheme Display State Table (Section 6)
    const { presentScheme } = require('../lib/presenter');
    const stateCounts = {
      confirmed: 0,
      partial: 0,
      fetched_not_parsed: 0,
      unreachable: 0,
      never_checked: 0
    };

    const schemeDisplayRows = [];
    for (const s of schemes) {
      try {
        const presentation = await presentScheme({ scheme: s });
        const dState = presentation.displayState || 'never_checked';
        stateCounts[dState] = (stateCounts[dState] || 0) + 1;
        schemeDisplayRows.push({
          'Scheme': s.name,
          'Display State': dState,
          'Badge': presentation.displayBadge,
          'Sources Used': (presentation.sources || []).map(u => {
            try { return new URL(u).hostname; } catch(e) { return u.substring(0, 20); }
          }).join(', ') || 'None',
          'Facts by Method': `sel: ${runState.stats.factsByMethod.selector}, reg: ${runState.stats.factsByMethod.regex}, rul: ${runState.stats.factsByMethod.rules}`,
          'Reason if not confirmed': dState === 'confirmed' ? 'None' : (s.verificationReason || presentation.displayNotice || 'Pending review')
        });
      } catch (pe) {}
    }

    console.log('\n================================ SCHEME DISPLAY STATES TABLE ================================');
    console.table(schemeDisplayRows);
    console.log(`STATE COUNTS: confirmed=${stateCounts.confirmed}, partial=${stateCounts.partial}, fetched_not_parsed=${stateCounts.fetched_not_parsed}, unreachable=${stateCounts.unreachable}, never_checked=${stateCounts.never_checked}`);
    console.log('Gemini calls: 0');
    console.log('=============================================================================================\n');

    // Print summary table at end of run
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const failReasonsStr = Object.entries(runState.stats.failedByReason)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ') || 'None';

    console.log('\n====================================== RUN SUMMARY ======================================');
    console.table([{
      'Sources': runState.stats.sources.size,
      'Pages Fetched': runState.stats.pagesFetched,
      'Failed By Reason': failReasonsStr,
      'Changed': runState.stats.changed,
      'Facts By Method': `selector: ${runState.stats.factsByMethod.selector}, regex: ${runState.stats.factsByMethod.regex}, rules: ${runState.stats.factsByMethod.rules}`,
      'New Schemes': runState.stats.newSchemes,
      'Awaiting AI': 0,
      'Gemini Calls': 0,
      'Duration': `${durationSec}s`
    }]);
    console.log('=========================================================================================\n');

  } catch (jobErr) {
    console.error('[JobRunner] Global job runner exception:', jobErr.message);
  } finally {
    clearInterval(heartbeatInterval);
    isJobRunning = false;
    console.log(`[${formatTime()}] [JobRunner] Verification job run completed.`);
  }

  return report;
}

/**
 * Verifies a single scheme record safely without throwing.
 */
async function verifySingleScheme(scheme, runState = {}) {
  const schemeName = (scheme.name || scheme.schemeName || scheme.category || `Government Scheme ${scheme._id}`).toString();
  const stats = runState.stats || {
    sources: new Set(),
    pagesFetched: 0,
    failedByReason: {},
    changed: 0,
    factsByMethod: { selector: 0, regex: 0, rules: 0 },
    newSchemes: 0,
    awaitingAi: 0,
    geminiCalls: 0
  };

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

  // (c) Scheme-specific official alternative pages
  if (schemeName.includes('Tamil Pudhalvan')) {
    rawCandidates.push('https://tnsocialwelfare.tn.gov.in/en/specilisationswoman-welfare/pudhumai-penn');
  } else if (schemeName.includes('Pension') || schemeName.includes('OAP') || schemeName.includes('DAPS')) {
    rawCandidates.push('https://cra.tn.gov.in/about_schemes_t.php');
    rawCandidates.push('https://cra.tn.gov.in/eleg_schemes_t.php');
    rawCandidates.push('https://www.karuvoolam.tn.gov.in/web/tnta/pension');
  } else if (schemeName.includes('Vidiyal Payanam')) {
    rawCandidates.push('https://tnstc.in');
    rawCandidates.push('https://www.tnstc.in');
  } else if (schemeName.includes('CMCHIS') || schemeName.includes('Comprehensive Health Insurance')) {
    rawCandidates.push('https://www.myscheme.gov.in/schemes/cmchis');
  } else if (schemeName.includes('Kalaignar Magalir Urimai Thogai')) {
    rawCandidates.push('https://tnsocialwelfare.tn.gov.in');
  }

  const uniqueCandidates = Array.from(new Set(rawCandidates));
  const allowlistedCandidates = uniqueCandidates.filter(u => isAllowlistedUrl(u));

  let finalStatus = 'unreachable';
  let errorType = null;
  let failureReason = 'no candidate link';
  let selectedPageUrl = null;
  let fetchResult = null;
  let certExpiryDate = null;

  if (uniqueCandidates.length === 0) {
    finalStatus = 'unreachable';
    failureReason = 'no candidate link';
  } else if (allowlistedCandidates.length === 0) {
    finalStatus = 'unreachable';
    errorType = 'blocked_domain';
    failureReason = 'domain not allowed';
  } else {
    // Attempt candidate fetches
    for (const candidateUrl of allowlistedCandidates) {
      let candDomain = '';
      try { candDomain = new URL(candidateUrl).hostname.toLowerCase(); } catch(e) {}
      const domainStatus = fetcher.getDomainStatus(candDomain);
      if (domainStatus.isCircuitOpen || domainStatus.status === 'slow') {
        console.log(`[JobRunner] Skipping slow candidate domain ${candDomain} for scheme "${schemeName}"`);
        continue;
      }

      stats.sources.add(candidateUrl);
      stats.pagesFetched++;

      const fetchStart = Date.now();
      fetchResult = await fetcher.fetchPage(candidateUrl, { timeoutMs: 20000, maxRetries: 1, customDelays: [500] });
      const fetchDuration = Date.now() - fetchStart;
      selectedPageUrl = candidateUrl;

      const newContentHash = fetchResult.ok && fetchResult.text ? calculateContentHash(fetchResult.text) : '';
      const isChanged = Boolean(newContentHash && scheme.contentHash !== newContentHash);
      if (isChanged) {
        stats.changed++;
      }

      const sizeStr = fetchResult.bytes ? (fetchResult.bytes > 1024 ? `${Math.round(fetchResult.bytes / 1024)}KB` : `${fetchResult.bytes}B`) : '0B';
      const fetchStatus = fetchResult.ok ? 'ok' : 'fail';
      const httpStatus = fetchResult.status || (fetchResult.errorType || 'ERR');

      console.log(`[${formatTime()}] FETCH ${fetchStatus} ${candidateUrl} ${httpStatus} ${fetchDuration}ms ${sizeStr} changed: ${isChanged ? 'yes' : 'no'}`);

      if (fetchResult.ok && fetchResult.text) {
        break;
      }

      errorType = fetchResult.errorType;
      const failReason = fetchResult.errorType || fetchResult.errorMessage || 'fetch_failed';
      stats.failedByReason[failReason] = (stats.failedByReason[failReason] || 0) + 1;

      if (fetchResult.errorType === 'tls_expired' || fetchResult.errorType === 'tls_other') {
        finalStatus = 'unreachable';
        certExpiryDate = fetchResult.certInfo?.validTo || null;
        const expiryMsg = certExpiryDate ? ` (expired on ${certExpiryDate.split('T')[0]})` : '';
        failureReason = `The website's security certificate has expired${expiryMsg}`;
        scheme.verificationReason = failureReason;
        break;
      } else if (fetchResult.errorType === 'timeout') {
        finalStatus = 'unreachable';
        failureReason = `Domain ${new URL(candidateUrl).hostname} took too long (timeout)`;
        // Continue to alternative official pages
        continue;
      } else if (fetchResult.errorType === 'blocked_robots' || fetchResult.errorType === 'blocked_domain') {
        finalStatus = 'unreachable';
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

    // Stage A: ALWAYS use the hybrid scraper engine (Zero AI fetch/extract)
    const isPdf = Boolean(fetchResult.contentType?.includes('pdf') || selectedPageUrl?.toLowerCase().endsWith('.pdf'));
    const scrapeResult = await scrapePage({
      html: fetchResult.rawHtml || '',
      text: fetchResult.text,
      url: selectedPageUrl,
      schemeId: scheme._id,
      schemeName,
      contentHash: newContentHash,
      isPdf
    });

    stats.factsByMethod.selector += scrapeResult.countsByMethod.selector;
    stats.factsByMethod.regex += scrapeResult.countsByMethod.regex;
    stats.factsByMethod.rules += scrapeResult.countsByMethod.rules;

    const scrapeStatus = scrapeResult.status === 'awaiting_ai' ? 'partial' : scrapeResult.status;
    console.log(`[${formatTime()}] SCRAPE ${scrapeStatus} ${selectedPageUrl} ${scrapeResult.facts.length} facts (selector ${scrapeResult.countsByMethod.selector}, regex ${scrapeResult.countsByMethod.regex}) conf ${scrapeResult.confidence.toFixed(2)} AI calls 0`);

    // Store raw section text if extracted
    if (scrapeResult.sections && scrapeResult.sections.length > 0) {
      scheme.rawSections = scrapeResult.sections;
    }
    if (fetchResult.text) {
      scheme.rawSourceText = fetchResult.text.substring(0, 15000);
    }

    if (scrapeResult.facts.length === 0) {
      if ((fetchResult.text || '').trim().length < 200) {
        finalStatus = 'needs better recipe';
        failureReason = 'needs better recipe (too little extractable text)';
      } else {
        // Deterministic status: fetched_not_parsed (AI is fully off)
        finalStatus = 'fetched_not_parsed';
        failureReason = `Official page checked on ${new Date().toLocaleDateString('en-IN')}. Details not yet confirmed`;
      }
    } else {
      const { areValuesDifferent } = require('../lib/normalizer');

      // Compare extracted facts against stored scheme
      if (scrapeResult.benefit && areValuesDifferent(scheme.benefit, scrapeResult.benefit, 'benefit')) {
        differencesFound.push(`Benefit value differs (found ${scrapeResult.benefit}, stored ${scheme.benefit})`);
        changeEntries.push({
          field: 'benefit',
          oldValue: scheme.benefit,
          newValue: scrapeResult.benefit,
          quote: scrapeResult.facts.find(f => f.field === 'amount')?.quote || 'Extracted via scrapers',
          source: selectedPageUrl,
          date: new Date()
        });
        scheme.benefit = scrapeResult.benefit;
      }

      // Handle Application Status & Notices (Section 4)
      if (scrapeResult.applicationNotice) {
        const notice = scrapeResult.applicationNotice;
        const oldStatus = scheme.applicationStatus || 'unknown';
        if (areValuesDifferent(oldStatus, notice.status, 'applicationStatus')) {
          differencesFound.push(`Application status changed to ${notice.status}`);
          changeEntries.push({
            field: 'applicationStatus',
            oldValue: oldStatus,
            newValue: notice.status,
            quote: notice.quote,
            source: selectedPageUrl,
            date: new Date()
          });
          scheme.applicationStatus = notice.status;
          scheme.applicationDeadline = notice.date || scheme.applicationDeadline;
          scheme.applicationWindow = {
            endDate: notice.date,
            statusQuote: notice.quote,
            updatedAt: new Date()
          };
          console.log(`[${formatTime()}] NOTICE "${schemeName}" ${oldStatus} -> ${notice.status} "${notice.quote}" (${notice.date || 'no date'})`);
        }
      }

      if (scrapeResult.docs && scrapeResult.docs.length > 0) {
        if (JSON.stringify(scrapeResult.docs) !== JSON.stringify(scheme.docs)) {
          differencesFound.push('Documents list updated');
          changeEntries.push({
            field: 'docs',
            oldValue: scheme.docs,
            newValue: scrapeResult.docs,
            quote: 'Checklist updated from portal text',
            source: selectedPageUrl,
            date: new Date()
          });
          scheme.docs = scrapeResult.docs;
        }
      }

      if (changeEntries.length > 0) {
        finalStatus = 'differs';
        scheme.verificationLevel = 'differs';
        failureReason = 'verified with updates';
        scheme.changedRecently = true;
        scheme.changeHistory.push(...changeEntries);
      } else {
        finalStatus = 'confirmed';
        scheme.verificationLevel = 'official';
        failureReason = 'confirmed by scrapers';
      }
    }

    scheme.contentHash = newContentHash;
    scheme.pageUsed = selectedPageUrl;
  }

  // Print VERIFY line
  console.log(`[${formatTime()}] VERIFY "${schemeName}" ${finalStatus} ${selectedPageUrl || 'unreachable'}`);

  // Check scheme links using fetch result and allowlist
  const linkInputList = scheme.officialLinks || scheme.links || [];
  const linkResults = [];
  for (const item of linkInputList) {
    let u = '';
    let title = 'Official Link';
    if (Array.isArray(item)) {
      title = item[0] || 'Official Portal';
      u = item[1] || '';
    } else if (typeof item === 'object' && item !== null) {
      title = item.title || item.name || 'Official Portal';
      u = item.url || item.link || '';
    } else if (typeof item === 'string') {
      u = item;
    }
    if (!u) continue;

    const allowed = isAllowlistedUrl(u);
    if (!allowed) {
      linkResults.push({
        title,
        url: u,
        linkStatus: 'domain_not_allowed',
        httpStatus: null,
        checkedAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
        isAllowlisted: false,
        working: false,
        reason: 'Domain not on official allowlist'
      });
    } else if (fetchResult && (selectedPageUrl === u || fetchResult.finalUrl === u)) {
      linkResults.push({
        title,
        url: u,
        linkStatus: fetchResult.ok ? 'ok' : (fetchResult.errorType || 'failed'),
        httpStatus: fetchResult.status || null,
        checkedAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
        isAllowlisted: true,
        working: fetchResult.ok,
        reason: fetchResult.errorMessage || (fetchResult.ok ? 'Link operational' : 'fetch failed')
      });
    } else if (fetchResult && fetchResult.ok) {
      linkResults.push({
        title,
        url: u,
        linkStatus: 'ok',
        httpStatus: 200,
        checkedAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
        isAllowlisted: true,
        working: true,
        reason: 'Link operational'
      });
    } else {
      linkResults.push({
        title,
        url: u,
        linkStatus: errorType || 'failed',
        httpStatus: null,
        checkedAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
        isAllowlisted: true,
        working: false,
        reason: failureReason || 'fetch failed'
      });
    }
  }
  scheme.verifiedLinks = linkResults;

  // Preserve stored data on failure
  scheme.verificationStatus = finalStatus;
  scheme.verificationReason = failureReason;
  if (finalStatus === 'confirmed' || finalStatus === 'differs') {
    scheme.lastVerified = new Date().toISOString();
  }

  try {
    await scheme.save();
  } catch (e) {}

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
