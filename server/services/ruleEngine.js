// Extended Rule Engine for Near-Miss Logic
// Extended Rule Engine for Near-Miss Logic
function evaluateEligibilityExtended(profile, rules, schemeStatus = 'ACTIVE') {
    if (schemeStatus && schemeStatus.toLowerCase() === 'closed') {
         return { verdict: 'closed', failedCount: 1, failedCriteria: [{ key: 'status', type: 'closed', required: 'active', actual: 'closed' }], unknownCriteria: [] };
    }
    
    if (!rules || Object.keys(rules).length === 0) {
        if (schemeStatus && schemeStatus.toLowerCase() === 'announced') {
             return { verdict: 'announced', failedCount: 0, failedCriteria: [], unknownCriteria: [] };
        }
        return { verdict: 'eligible', failedCount: 0, failedCriteria: [], unknownCriteria: [] };
    }

    let failedCriteria = [];
    let unknownCriteria = [];

    // Fields that are realistic to "near-miss" suggest (e.g. age, income).
    // Immutable fields (gender, disability, marital status) are excluded from near-miss suggestions.
    const mutableFields = ['age', 'income', 'famhead'];

    for (const [key, condition] of Object.entries(rules)) {
        const profileValue = profile[key];
        
        if (profileValue === undefined || profileValue === null) {
            unknownCriteria.push(key);
            continue;
        }

        if (typeof condition === 'object') {
            if (condition.$gte && profileValue < condition.$gte) {
                failedCriteria.push({ key, type: 'too_low', required: condition.$gte, actual: profileValue });
            }
            if (condition.$lt && profileValue >= condition.$lt) {
                failedCriteria.push({ key, type: 'too_high', required: condition.$lt, actual: profileValue });
            }
            if (condition.$in && Array.isArray(condition.$in)) {
                if (!condition.$in.includes(profileValue)) {
                    failedCriteria.push({ key, type: 'not_in', required: condition.$in, actual: profileValue });
                }
            }
        } else {
            if (profileValue !== condition) {
                failedCriteria.push({ key, type: 'mismatch', required: condition, actual: profileValue });
            }
        }
    }

    if (failedCriteria.length === 0 && unknownCriteria.length === 0) {
        if (schemeStatus && schemeStatus.toLowerCase() === 'announced') {
             return { verdict: 'announced', failedCount: 0, failedCriteria, unknownCriteria };
        }
        return { verdict: 'eligible', failedCount: 0, failedCriteria, unknownCriteria };
    }

    // Determine Near-Miss
    // Rule: Exactly ONE failed criterion, NO unknown criteria, and the failed criterion MUST be mutable.
    if (failedCriteria.length === 1 && unknownCriteria.length === 0) {
        const failedKey = failedCriteria[0].key;
        if (mutableFields.includes(failedKey)) {
             return { verdict: 'near_miss', failedCount: 1, failedCriteria, unknownCriteria };
        }
    }

    let finalVerdict = 'not_eligible';
    if (failedCriteria.length === 0 && schemeStatus && schemeStatus.toLowerCase() === 'announced') {
        finalVerdict = 'announced';
    } else if (failedCriteria.length === 0) {
        // Fallback if we missed the top check
        finalVerdict = 'eligible';
    }

    return { verdict: finalVerdict, failedCount: failedCriteria.length, failedCriteria, unknownCriteria };
}

function generateNearMissMessage(failedCriterion) {
    if (failedCriterion.key === 'income' && failedCriterion.type === 'too_high') {
        const diff = failedCriterion.actual - failedCriterion.required;
        return `Your annual family income is ₹${diff} above the ₹${failedCriterion.required} limit.`;
    }
    if (failedCriterion.key === 'age' && failedCriterion.type === 'too_low') {
        const diff = failedCriterion.required - failedCriterion.actual;
        return `You are ${diff} years below the minimum age of ${failedCriterion.required}.`;
    }
    if (failedCriterion.key === 'famhead' && failedCriterion.type === 'mismatch') {
        return `You must be designated as the head of the family on your ration card to qualify.`;
    }
    return `You do not meet the ${failedCriterion.key} requirement.`;
}

module.exports = { evaluateEligibilityExtended, generateNearMissMessage };
