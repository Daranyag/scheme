const mongoose = require('mongoose');
const DiscoveryJob = require('../models/DiscoveryJob');
const Discovery = require('../models/Discovery');
const { fetchCleanPageText } = require('./fetcher');
const { isAllowlistedUrl } = require('../config/allowlist');
const { evaluateEligibilityExtended } = require('./ruleEngine');
const sourcesConfig = require('../sources.json');

/**
 * Worker polling loop to run pending discovery jobs with concurrency cap = 2.
 */
async function processDiscoveryJobs() {
    try {
        // Count running jobs (locked within last 10 minutes)
        const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
        const activeCount = await DiscoveryJob.countDocuments({
            status: 'processing',
            lockedAt: { $gt: tenMinsAgo }
        });

        if (activeCount >= 2) {
            return; // Global concurrency limit of 2 reached
        }

        const slotsAvailable = 2 - activeCount;

        for (let i = 0; i < slotsAvailable; i++) {
            const job = await DiscoveryJob.findOneAndUpdate(
                {
                    status: 'pending',
                    nextRunAt: { $lte: new Date() }
                },
                {
                    status: 'processing',
                    lockedAt: new Date(),
                    $inc: { attempts: 1 }
                },
                { returnDocument: 'after', sort: { nextRunAt: 1 } }
            );

            if (!job) break;

            // Run job asynchronously
            runSingleJob(job).catch(err => {
                console.error(`Error running discovery job ${job._id}:`, err);
            });
        }
    } catch (err) {
        console.error('Error in processDiscoveryJobs:', err.message);
    }
}

async function runSingleJob(job) {
    const logs = [];
    const queries = [];
    const candidates = [];
    const verified = [];
    const rejected = [];

    let geminiCallCount = 0;
    let pagesFetchedCount = 0;

    const addLog = (message, details = null) => {
        logs.push({ timestamp: new Date(), message, details });
    };

    try {
        addLog('Discovery job started', { deviceId: job.deviceId, profile: job.profileSync });

        // Skip check: searched in last 24 hours AND profile hasn't changed since last run
        if (job.lastRunAt && (new Date() - job.lastRunAt < 24 * 60 * 60 * 1000) && job.attempts > 1) {
            addLog('Job skipped: searched in the last 24 hours');
            job.status = 'completed';
            job.lockedAt = null;
            job.nextRunAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
            job.logs.push(...logs);
            await job.save();
            return;
        }

        const profile = job.profileSync || {};
        const profileDesc = `Age: ${profile.age || 'any'}, Gender: ${profile.gender || 'any'}, Income Band: ${profile.incomeBand || profile.income || 'any'}, Marital: ${profile.marital || 'any'}, Disability: ${profile.disability || 0}%, Destitute: ${profile.flags?.destitute || false}, FamHead: ${profile.flags?.famhead || false}, GovSchool: ${profile.flags?.govschool || false}, HigherEd: ${profile.flags?.highered || false}`;

        // Stage A: Rule-based query discovery (Zero AI)
        let queryList = [];
        if (profile.retiredFrom === 'Government' || profile.employmentSector === 'Government-Permanent') {
            queryList.push('Tamil Nadu retired government employee pension health insurance scheme official');
            queryList.push('TN government pensioners welfare benefits official cra.tn.gov.in');
        }

        if (profile.workStatus === 'Farmer' || profile.workStatus === 'Agricultural labourer') {
            queryList.push('Tamil Nadu farmer subsidy agricultural welfare scheme official');
            queryList.push('TN crop insurance PM KISAN farmer portal official tn.gov.in');
        }

        if (profile.role === 'School student' || profile.role === 'College student') {
            queryList.push('Tamil Nadu student scholarship Pudhumai Penn Tamil Pudhalvan official');
            queryList.push('TN higher education student welfare schemes portal.naanmudhalvan.tn.gov.in');
        }

        queryList.push(
            'Tamil Nadu old age pension destitute widow eligibility',
            'TN government social security pension scheme criteria',
            'Tamil Nadu welfare schemes for women destitute',
            'TN official pension schemes eligibility cra.tn.gov.in'
        );

        queryList = queryList.slice(0, 8);
        queries.push(...queryList);
        addLog('Generated rule-based search queries without AI', { queries: queryList });

        // Step 2: Candidates from official sources.json pages
        const candidateMap = new Map();
        for (const page of sourcesConfig.officialPages || []) {
            for (const schemeName of page.schemes || []) {
                candidateMap.set(page.url, { schemeName, url: page.url });
            }
        }

        const candidateList = Array.from(candidateMap.values());
        candidates.push(...candidateList);
        addLog('Identified candidates', { candidateCount: candidateList.length, candidates: candidateList });

        // Step 3: Fetch & Verify Candidates (capped at 25 pages & ~40 Gemini calls)
        for (const candidate of candidateList) {
            if (pagesFetchedCount >= 25 || geminiCallCount >= 40) {
                addLog('Cap reached during candidate processing', { pagesFetchedCount, geminiCallCount });
                break;
            }

            const { schemeName, url } = candidate;

            // Never create a scheme from a source name, portal name, service channel, menu item or department
            const forbiddenPatterns = [
                /\bportal\b/i,
                /\bservice channel\b/i,
                /\bapplication channel\b/i,
                /\bmenu\b/i,
                /\bdepartment\b/i,
                /\bministry\b/i,
                /\bdirectorate\b/i,
                /\btaluk office\b/i,
                /\bdistrict office\b/i,
                /\be-sevai\b/i,
                /\bchannel\b/i
            ];
            if (forbiddenPatterns.some(p => p.test(schemeName))) {
                rejected.push({ schemeName, url, reason: 'Candidate is a portal name, service channel, department, or menu item' });
                continue;
            }

            // 1. Allowlist check
            if (!isAllowlistedUrl(url)) {
                rejected.push({ schemeName, url, reason: 'Not on allowlisted official domain' });
                continue;
            }

            // 2. Fetch page
            pagesFetchedCount++;
            const fetchRes = await fetchCleanPageText(url);
            if (!fetchRes.success || !fetchRes.text) {
                rejected.push({ schemeName, url, reason: `Page text could not be fetched (${fetchRes.reason || 'network error'})` });
                continue;
            }

            // 3. Scheme name in heading or title check
            const cheerio = require('cheerio');
            const $ = cheerio.load(fetchRes.rawHtml || '');
            const titleAndHeadings = [
                $('title').text(),
                $('h1').text(),
                $('h2').text(),
                $('h3').text(),
                $('h4').text()
            ].join(' ').toLowerCase();

            const nameWords = schemeName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
            const hasNameInHeadingOrTitle = titleAndHeadings.includes(schemeName.toLowerCase()) ||
                (nameWords.length > 0 && nameWords.filter(w => titleAndHeadings.includes(w)).length >= Math.ceil(nameWords.length * 0.7));

            if (!hasNameInHeadingOrTitle) {
                rejected.push({ schemeName, url, reason: 'Scheme name not found in page heading or title' });
                continue;
            }

            // 4. Extract details using the Scraper Engine (Zero AI)
            let extracted = null;
            let confidence = 'medium';

            try {
                const { scrapePage } = require('../scrapers/scraperEngine');
                const scrapeRes = await scrapePage({
                    html: fetchRes.rawHtml || '',
                    text: fetchRes.text,
                    url,
                    schemeName
                });

                const quotedFacts = (scrapeRes.facts || []).filter(f => f.quote && f.quote.trim().length > 0);
                if (quotedFacts.length > 0) {
                    extracted = {
                        name: schemeName,
                        benefit: scrapeRes.benefit || '',
                        eligibilityRules: scrapeRes.eligibilityRules || {},
                        unmappedCriteria: scrapeRes.unmapped || [],
                        requiredDocuments: scrapeRes.docs || [],
                        howToApply: []
                    };
                    confidence = 'high';
                } else {
                    rejected.push({ schemeName, url, reason: 'No quoted facts found on official page' });
                    continue;
                }
            } catch (e) {
                addLog('Scraper engine extraction fallback', { error: e.message });
            }

            if (!extracted) {
                rejected.push({ schemeName, url, reason: 'Could not extract valid scheme with quoted facts' });
                continue;
            }

            // Step 4: Run rule engine against user profile
            const ruleEngineResult = evaluateEligibilityExtended(profile, extracted.eligibilityRules || {});
            
            let eligibilityStatus;
            if (ruleEngineResult.verdict === 'eligible') {
                if (extracted.unmappedCriteria && extracted.unmappedCriteria.length > 0) {
                    eligibilityStatus = 'possibly_eligible';
                } else {
                    eligibilityStatus = 'eligible';
                }
            } else if (ruleEngineResult.verdict === 'near_miss') {
                eligibilityStatus = 'possibly_eligible';
            } else {
                rejected.push({
                    schemeName,
                    url,
                    reason: `Failed profile eligibility: ${ruleEngineResult.failedCriteria?.map(f => f.key).join(', ') || 'rules mismatch'}`
                });
                continue;
            }

            // Save to per-device Discoveries collection if confidence is high or medium
            if (['high', 'medium'].includes(confidence)) {
                const domain = new URL(url).hostname;
                if (mongoose.connection.readyState === 1) {
                    await Discovery.findOneAndUpdate(
                        { deviceId: job.deviceId, name: extracted.name },
                        {
                            deviceId: job.deviceId,
                            name: extracted.name,
                            nameTamil: extracted.nameTamil || '',
                            benefit: extracted.benefit,
                            domain: domain,
                            sourceUrl: url,
                            confidence: confidence,
                            eligibilityStatus: eligibilityStatus,
                            rules: extracted.eligibilityRules || {},
                            unmappedCriteria: extracted.unmappedCriteria || [],
                            docs: extracted.requiredDocuments || [],
                            steps: extracted.howToApply || [],
                            origin: 'ai-discovered',
                            lastChecked: new Date(),
                            notRelevant: false
                        },
                        { upsert: true, returnDocument: 'after' }
                    );
                }

                verified.push({
                    name: extracted.name,
                    domain,
                    sourceUrl: url,
                    confidence,
                    eligibilityStatus
                });
            } else {
                rejected.push({ schemeName, url, reason: 'Confidence low (criteria missing on official page)' });
            }
        }

        // Job success summary
        addLog('Discovery job completed', {
            queriesCount: queries.length,
            candidatesCount: candidates.length,
            verifiedCount: verified.length,
            rejectedCount: rejected.length,
            verified,
            rejected,
            geminiCallCount,
            pagesFetchedCount
        });

        job.status = 'completed';
        job.lastRunAt = new Date();
        job.nextRunAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days
        job.lockedAt = null;
        job.logs.push(...logs);

        if (mongoose.connection.readyState === 1) {
            await job.save();
        }

    } catch (err) {
        addLog('Discovery job failed', { error: err.message, stack: err.stack });
        job.status = 'failed';
        job.lockedAt = null;
        job.logs.push(...logs);
        if (mongoose.connection.readyState === 1) {
            await job.save();
        }
    }
}

module.exports = {
    processDiscoveryJobs,
    runSingleJob
};
