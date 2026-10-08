// Helper for the Scheme Finder criteria mapping logic
function mapCriterionToProfile(profile, criterionField, criterionOperator, criterionValue) {
    const profileValue = profile[criterionField];

    if (profileValue === undefined || profileValue === null) {
        return { status: 'unknown', message: `Missing ${criterionField} in profile` };
    }

    if (criterionOperator === '==') {
        return profileValue === criterionValue 
            ? { status: 'met', message: `Matches ${criterionField}: ${criterionValue}` }
            : { status: 'failed', message: `Your ${criterionField} (${profileValue}) != ${criterionValue}` };
    }

    if (criterionOperator === '<' || criterionOperator === '<=') {
        const val = Number(criterionValue);
        const pVal = Number(profileValue);
        if (isNaN(val) || isNaN(pVal)) return { status: 'unknown', message: `Invalid numbers for ${criterionField}` };
        
        const passed = criterionOperator === '<' ? pVal < val : pVal <= val;
        return passed 
            ? { status: 'met', message: `Your ${criterionField} ₹${pVal} is below limit ₹${val}` }
            : { status: 'failed', message: `Your ${criterionField} ₹${pVal} is too high (limit: ₹${val})` };
    }
    
    if (criterionOperator === '>' || criterionOperator === '>=') {
        const val = Number(criterionValue);
        const pVal = Number(profileValue);
        if (isNaN(val) || isNaN(pVal)) return { status: 'unknown', message: `Invalid numbers for ${criterionField}` };
        
        const passed = criterionOperator === '>' ? pVal > val : pVal >= val;
        return passed 
            ? { status: 'met', message: `Your ${criterionField} ${pVal} meets minimum ${val}` }
            : { status: 'failed', message: `Your ${criterionField} ${pVal} is below minimum ${val}` };
    }

    return { status: 'unknown', message: `Unmapped criterion` };
}

// Logic to identify "What would make me eligible"
function getMissingRequirement(results) {
    const failedCriteria = results.filter(r => r.status === 'failed');
    if (failedCriteria.length === 1) {
        // Just return the failed message as the missing requirement
        return `You would be eligible if: ${failedCriteria[0].message.replace('Your', 'The')}`;
    }
    return null;
}

module.exports = { mapCriterionToProfile, getMissingRequirement };
