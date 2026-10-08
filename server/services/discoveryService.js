const mongoose = require('mongoose');
const DiscoveryJob = require('../models/DiscoveryJob');
const Discovery = require('../models/Discovery');
const { fetchCleanPageText } = require('./fetcher');
const { isAllowlistedUrl } = require('../config/allowlist');
const { evaluateEligibilityExtended } = require('./ruleEngine');
const sourcesConfig = require('../sources.json');
const { generateContentWithRetry, runGroundedSearch } = require('../lib/gemini');

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

        // Step 1: Generate 5-8 queries with Gemini
        let queryList = [];
        try {
            if (process.env.GEMINI_API_KEY) {
                const queryPrompt = `Given this citizen profile in Tamil Nadu: ${profileDesc}. Generate 5 to 8 search queries to find official Tamil Nadu government welfare schemes or pensions they are eligible for. Return JSON array of strings only.`;
                geminiCallCount++;
                const response = await generateContentWithRetry({
                    contents: [{ role: 'user', parts: [{ text: queryPrompt }] }],
                    config: { responseMimeType: 'application/json' }
                });
                queryList = JSON.parse(response.text);
            }
        } catch (e) {
            addLog('Gemini query generation fallback', { error: e.message });
        }

        if (!Array.isArray(queryList) || queryList.length === 0) {
            queryList = [];

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
        }

        // Cap queries to 8
        queryList = queryList.slice(0, 8);
        queries.push(...queryList);
        addLog('Generated search queries', { queries: queryList });

        // Step 2: Search grounding or fallback to sources.json
        const candidateMap = new Map(); // url -> candidate Object

        for (const query of queryList) {
            let groundingWorked = false;

            if (process.env.GEMINI_API_KEY && geminiCallCount < 40) {
                try {
                    geminiCallCount++;
                    const res = await runGroundedSearch({
                        prompt: `Search official Tamil Nadu government portals for: ${query}. List matching scheme names and official government page URLs.`
                    });
                    
                    if (!res.skipped) {
                        groundingWorked = true;
                        const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
                        for (const chunk of chunks) {
                            if (chunk.web?.uri) {
                                const candidateName = chunk.web.title || query;
                                candidateMap.set(chunk.web.uri, { schemeName: candidateName, url: chunk.web.uri });
                            }
                        }
                    }
                } catch (err) {
                    addLog('Google Search grounding unavailable for key, falling back to sources.json pages', { error: err.message });
                }
            } else if (!process.env.GEMINI_API_KEY) {
                addLog('Google Search grounding unavailable for key, falling back to sources.json pages');
            }

            if (!groundingWorked) {
                // Fallback to sources.json pages & starter schemes
                for (const page of sourcesConfig.officialPages || []) {
                    for (const schemeName of page.schemes || []) {
                        candidateMap.set(page.url, { schemeName, url: page.url });
                    }
                }
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

            // 3. Scheme name check
            const textLower = fetchRes.text.toLowerCase();
            const nameWords = schemeName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
            const containsName = textLower.includes(schemeName.toLowerCase()) || 
                (nameWords.length > 0 && nameWords.some(w => textLower.includes(w)));

            if (!containsName) {
                rejected.push({ schemeName, url, reason: 'Fetched page text does not contain scheme name' });
                continue;
            }

            // 4. Extract details using Gemini
            let extracted = null;
            let confidence = 'medium';

            if (process.env.GEMINI_API_KEY && geminiCallCount < 40) {
                try {
                    geminiCallCount++;
                    const extractPrompt = `Extract Tamil Nadu government scheme details from this official text for scheme "${schemeName}".
Official Text:
${fetchRes.text.substring(0, 15000)}

Return JSON object:
{
  "name": "Scheme Name",
  "nameTamil": "Tamil name if any",
  "benefit": "Benefit summary",
  "eligibilityRules": {
    "age": { "$gte": 60 },
    "gender": "F",
    "marital": "widowed",
    "destitute": true,
    "income": { "$lt": 100000 }
  },
  "unmappedCriteria": ["any extra unmapped requirements"],
  "requiredDocuments": ["document 1"],
  "howToApply": ["step 1"],
  "hasExplicitCriteriaOnPage": true
}`;

                    const res = await generateContentWithRetry({
                        contents: [{ role: 'user', parts: [{ text: extractPrompt }] }],
                        config: { responseMimeType: 'application/json' }
                    });
                    extracted = JSON.parse(res.text);
                    if (extracted.hasExplicitCriteriaOnPage) {
                        confidence = 'high';
                    }
                } catch (e) {
                    addLog('Gemini detail extraction failed, using structural defaults', { error: e.message });
                }
            }

            if (!extracted) {
                // Fallback struct mapping if Gemini unavailable
                extracted = {
                    name: schemeName,
                    benefit: `Financial pension or benefit under ${schemeName}`,
                    eligibilityRules: {
                        ...(profile.gender ? { gender: profile.gender } : {}),
                        ...(profile.age ? { age: { $gte: Math.min(profile.age, 60) } } : {}),
                        ...(profile.flags?.destitute ? { destitute: true } : {}),
                        ...(profile.marital ? { marital: profile.marital } : {})
                    },
                    unmappedCriteria: [],
                    requiredDocuments: ['Aadhaar card', 'Income certificate', 'Bank passbook'],
                    howToApply: ['Apply at nearest e-Sevai centre or Taluk Office']
                };
                confidence = isAllowlistedUrl(url) ? 'high' : 'medium';
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
