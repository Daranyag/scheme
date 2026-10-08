const Scheme = require('../models/Scheme');
const SearchLog = require('../models/SearchLog');
const UnmatchedQuery = require('../models/UnmatchedQuery');
const { evaluateEligibilityExtended } = require('./ruleEngine');
const aliases = require('../data/aliases.json');
const fs = require('fs');
const path = require('path');

// Basic cache
const cacheLevel123 = new Map();
const cacheLevel4 = new Map();

function normalizeQuery(q) {
  let norm = (q || '').toLowerCase().replace(/[^\w\s\u0B80-\u0BFF]/g, '').trim();
  // Apply aliases
  for (const [canonical, syns] of Object.entries(aliases)) {
    if (syns.some(s => norm.includes(s.toLowerCase()))) {
      norm += ` ${canonical.toLowerCase()}`;
    }
  }
  return norm;
}

function processWithProfile(schemes, profile) {
    return schemes.map(s => {
        const rules = s.eligibilityRules || s.rules || {};
        const { verdict, failedCriteria, unknownCriteria } = evaluateEligibilityExtended(profile, rules, s.status);
        
        let finalVerdict = verdict;
        if (s.reviewStatus === 'pending') {
             finalVerdict = 'possiblyEligibleVerify'; // Override for pending schemes
        }
        
        return {
            ...s.toObject(),
            searchVerdict: finalVerdict,
            searchFailedCriteria: failedCriteria,
            searchUnknownCriteria: unknownCriteria
        };
    });
}

async function level1LocalDb(normQuery, profile) {
    // Exact, prefix, fuzzy via regex for simplicity in MVP
    const parts = normQuery.split(' ').filter(Boolean);
    if (parts.length === 0) return [];
    const regexes = parts.map(p => new RegExp(p, 'i'));
    
    const showPending = process.env.SHOW_PENDING_TO_USERS === 'true';
    const reviewStatusFilter = showPending ? { $in: ['approved', 'pending'] } : 'approved';

    const results = await Scheme.find({
        reviewStatus: reviewStatusFilter,
        $or: [
            { name: { $in: regexes } },
            { nameTamil: { $in: regexes } },
            { category: { $in: regexes } },
            { benefit: { $in: regexes } },
            { aliases: { $in: regexes } }
        ]
    }).limit(10);
    return processWithProfile(results, profile);
}

async function level2Topic(normQuery, profile) {
    // Topic & Question search (Intent extraction)
    const showPending = process.env.SHOW_PENDING_TO_USERS === 'true';
    const reviewStatusFilter = showPending ? { $in: ['approved', 'pending'] } : 'approved';
    
    const results = await Scheme.find(
        { reviewStatus: reviewStatusFilter, $text: { $search: normQuery } },
        { score: { $meta: "textScore" } }
    ).sort({ score: { $meta: "textScore" } }).limit(5);

    return processWithProfile(results, profile);
}

async function level3LiveData(normQuery, profile) {
    // Search Evidence Ledger / Live pending
    return [];
}

async function level4LiveLookup(query) {
    // Live grounding via Gemini Custom Search
    const gemini = require('../lib/gemini');
    try {
        const liveResult = await gemini.runGroundedSearch({
            prompt: `Find government schemes in Tamil Nadu related to: ${query}`,
            contents: [{ role: 'user', parts: [{ text: `Find Tamil Nadu government schemes related to: ${query}` }] }]
        });
        
        if (liveResult.skipped || !liveResult.text) return [];
        
        return [{
            _id: 'live-' + Date.now(),
            name: `Live Answer for: ${query}`,
            benefit: liveResult.text,
            category: 'Live Search',
            searchVerdict: 'live_answer',
            isVirtual: true,
            rules: {},
            eligibilityRules: {},
            officialLinks: []
        }];
    } catch (e) {
        console.error("Level 4 live lookup failed:", e);
        return [];
    }
}

async function logSearch(query, normQuery, language, levelReached, resultCount) {
    try {
        await SearchLog.create({
            query,
            normalizedQuery: normQuery,
            language,
            levelReached,
            resultCount
        });
    } catch (e) {}
}

async function executeUnifiedSearch(query, profile, language) {
    const notes = [];
    const startTime = Date.now();
    const timeLimit = 6000;
    
    const normQuery = normalizeQuery(query);
    
    // Quick out for non-scheme queries
    const nonSchemeKeywords = ['weather', 'movies', 'sports', 'cricket', 'news'];
    if (nonSchemeKeywords.some(k => normQuery.includes(k))) {
        return {
            ok: true,
            level: 0,
            results: [],
            suggestions: [],
            notes: ["The Scheme Finder is strictly for government welfare schemes, pensions, scholarships, and benefits. Try searching for 'pension' or 'scholarship'."]
        };
    }
    
    let results = [];
    let levelReached = 0;
    
    try {
        if (Date.now() - startTime < timeLimit) {
           results = await level1LocalDb(normQuery, profile);
           if (results.length > 0) levelReached = 1;
        }
    } catch (e) { notes.push("Level 1 (Local DB) skipped due to error."); }
    
    if (results.length === 0) {
        try {
            if (Date.now() - startTime < timeLimit) {
               results = await level2Topic(normQuery, profile);
               if (results.length > 0) levelReached = 2;
            }
        } catch (e) { notes.push("Level 2 (Topic) skipped due to error."); }
    }
    
    if (results.length === 0) {
        try {
            if (Date.now() - startTime < timeLimit) {
               results = await level3LiveData(normQuery, profile);
               if (results.length > 0) levelReached = 3;
            }
        } catch (e) { notes.push("Level 3 (Live Data) skipped due to error."); }
    }
    
    // If nothing found in 1-3, do Level 4
    if (results.length === 0) {
        try {
           const liveRes = await level4LiveLookup(query);
           results = liveRes;
           if (results.length > 0) levelReached = 4;
        } catch (e) { notes.push("Level 4 (Live Lookup) skipped due to error."); }
    }
    
    // Level 5 Not Found
    if (results.length === 0) {
        levelReached = 5;
        try {
            await UnmatchedQuery.findOneAndUpdate(
               { query: normQuery },
               { $inc: { count: 1 }, lastSeenAt: new Date(), language },
               { upsert: true }
            );
        } catch (e) {}
        
        return {
            ok: true,
            level: 5,
            results: [],
            suggestions: ["Try the scheme's full name", "Describe who it is for (e.g. 'pension for widows')"],
            notes: [...notes, "No highly confident matches found. We've logged this search to improve our database."]
        };
    }
    
    await logSearch(query, normQuery, language, levelReached, results.length);
    
    return {
        ok: true,
        level: levelReached,
        results,
        suggestions: [],
        notes
    };
}

module.exports = {
    executeUnifiedSearch
};
