const Scheme = require('../models/Scheme');

// Mock rule engine for the backend (should mirror the Dart one)
function isEligible(profile, rules) {
    if (!rules || Object.keys(rules).length === 0) return false;
    for (const [key, condition] of Object.entries(rules)) {
        const profileValue = profile[key];
        if (profileValue === undefined) return false;
        
        if (typeof condition === 'object') {
            if (condition.$gte && profileValue < condition.$gte) return false;
            if (condition.$lt && profileValue >= condition.$lt) return false;
        } else {
            if (profileValue !== condition) return false;
        }
    }
    return true;
}

const tools = {
    search_schemes: async ({ query }) => {
        // Simple regex search. In production, use MongoDB Text Search.
        const regex = new RegExp(query, 'i');
        const schemes = await Scheme.find({ 
            $or: [{ name: regex }, { benefit: regex }] 
        }).limit(5).select('_id name benefit verificationLevel');
        return schemes;
    },

    get_scheme: async ({ id }) => {
        const scheme = await Scheme.findById(id);
        return scheme || { error: "Scheme not found" };
    },

    check_eligibility: async ({ schemeId, profileOverride }, currentProfile) => {
        const scheme = await Scheme.findById(schemeId);
        if (!scheme) return { error: "Scheme not found" };
        
        // Merge overriding values (e.g. "what if my income was 90000")
        const mergedProfile = { ...currentProfile, ...profileOverride };
        const eligible = isEligible(mergedProfile, scheme.rules);
        
        return {
            verdict: eligible ? "eligible" : "not_eligible",
            checkedAgainstProfile: mergedProfile,
            schemeRules: scheme.rules
        };
    },

    list_my_eligible_schemes: async ({}, currentProfile) => {
        const allSchemes = await Scheme.find();
        const eligible = allSchemes.filter(s => isEligible(currentProfile, s.rules));
        return eligible.map(s => ({ id: s._id, name: s.name, benefit: s.benefit }));
    }
    
    // web_lookup would use Gemini Google Search Grounding here.
};

module.exports = tools;
