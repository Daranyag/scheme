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
    const mutableFields = ['age', 'income', 'famhead', 'rationCardHead'];

    const isGraduated = profile.role === 'Completed studies' ||
        profile.role === 'Not studying' ||
        ((profile.highestQual === 'Graduate' || profile.highestQual === 'Post-Graduate') &&
            profile.role !== 'College student' &&
            profile.role !== 'Higher studies');

    for (const [key, condition] of Object.entries(rules)) {
        let profileValue = profile[key];
        if ((key === 'annualIncome' || key === 'income') && profileValue === undefined) {
            profileValue = profile.familyIncome !== undefined ? profile.familyIncome : profile.income;
        }
        if (key === 'communityCategory' && profileValue === undefined) profileValue = profile.community;
        if (key === 'pregnant' && profileValue === undefined) profileValue = profile.isPregnant;
        if (key === 'isPregnant' && profileValue === undefined) profileValue = profile.pregnant;
        if (key === 'newborn' && profileValue === undefined) profileValue = profile.hasNewborn;
        if (key === 'hasNewborn' && profileValue === undefined) profileValue = profile.newborn;
        if (key === 'student' && profileValue === undefined) profileValue = profile.isStudent;
        if (key === 'isStudent' && profileValue === undefined) profileValue = profile.student;
        if (key === 'famhead' && profileValue === undefined) {
            if (profile.rationCardHead === 'female_head' || profile.rationCardHead === 'self') {
                profileValue = true;
            } else if (profile.rationCardHead === 'spouse' && (profile.gender === 'Female' || profile.gender === 'F')) {
                profileValue = true; // TN KMUT allows wife of male head on ration card
            } else {
                profileValue = false;
            }
        }
        if (key === 'rationCardHead' && profileValue === undefined) {
            profileValue = profile.famhead ? 'female_head' : profile.rationCardHead;
        }
        if (key === 'needsSpectacles' || key === 'hasEyeProblem' || key === 'eyeProblem') {
            profileValue = profile.hasEyeProblem || (Array.isArray(profile.healthConditions) && profile.healthConditions.includes('Eye / Vision problem'));
        }
        if (key === 'targetOccupation') {
            if (condition === 'farmer') {
                const hasNoLand = (profile.landWetAcres === 0 || profile.landWetAcres === '0') && 
                                  (profile.landDryAcres === 0 || profile.landDryAcres === '0');
                if (profile.workStatus === 'Farmer') {
                    profileValue = 'farmer';
                } else if (profile.workStatus !== undefined && profile.workStatus !== null && profile.workStatus !== 'Farmer' && hasNoLand) {
                    profileValue = profile.workStatus;
                } else if (profile.landWetAcres > 0 || profile.landDryAcres > 0) {
                    profileValue = 'farmer';
                }
            } else if (condition === 'agricultural_labourer') {
                if (profile.workStatus === 'Agricultural labourer') {
                    profileValue = 'agricultural_labourer';
                } else if (profile.workStatus !== undefined && profile.workStatus !== null) {
                    profileValue = profile.workStatus;
                }
            }
        }
        if (key === 'workerType' && condition === 'folk_artiste') {
            if (profile.workStatus === 'Folk artiste' || profile.welfareBoard) {
                profileValue = 'folk_artiste';
            }
        }
        if (key === 'workerType' && condition === 'weaver') {
            if (profile.workStatus === 'Weaver' || profile.workStatus === 'Handloom') {
                profileValue = 'weaver';
            }
        }
        if (key === 'targetProfession' && condition === 'journalist') {
            if (profile.workStatus === 'Journalist') {
                profileValue = 'journalist';
            } else if (profile.workStatus !== undefined && profile.workStatus !== null) {
                profileValue = profile.workStatus;
            }
        }
        if (key === 'target' && condition === 'manufacturer') {
            profileValue = profile.isManufacturer === true ? 'manufacturer' : (profile.isManufacturer === false ? 'individual' : undefined);
        }

        if ((key === 'courseLevel' || key === 'student') && isGraduated) {
            failedCriteria.push({ key, type: 'graduated', required: condition, actual: profile.role || profile.highestQual });
            continue;
        }

        if (key === 'highered') {
            if (condition === true && (isGraduated || !profile.highered)) {
                failedCriteria.push({ key, type: 'mismatch', required: condition, actual: false });
            }
            continue;
        }

        if (key === 'communityCategory' || key === 'community') {
            const reqComm = String(condition).toUpperCase().trim();
            const userComm = String(profileValue || '').toUpperCase().trim();
            if (!userComm || userComm === 'PREFER_NOT_TO_SAY') {
                unknownCriteria.push(key);
                continue;
            }
            const isMatch = (reqComm === 'SC/ST' || reqComm === 'SC, ST')
                ? (userComm === 'SC' || userComm === 'ST')
                : (reqComm.includes(userComm) && userComm.length > 0);
            if (!isMatch) {
                failedCriteria.push({ key, type: 'mismatch', required: condition, actual: profileValue });
            }
            continue;
        }
        
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
            if (condition.$lte && profileValue > condition.$lte) {
                failedCriteria.push({ key, type: 'too_high', required: condition.$lte, actual: profileValue });
            }
            if (condition.$in && Array.isArray(condition.$in)) {
                if (!condition.$in.includes(profileValue)) {
                    failedCriteria.push({ key, type: 'not_in', required: condition.$in, actual: profileValue });
                }
            }
        } else if (key === 'gender') {
            const normProfileGender = (profileValue === 'Female' || profileValue === 'F') ? 'F' : ((profileValue === 'Male' || profileValue === 'M') ? 'M' : profileValue);
            const normCondition = (condition === 'Female' || condition === 'F') ? 'F' : ((condition === 'Male' || condition === 'M') ? 'M' : condition);
            if (normProfileGender !== normCondition) {
                failedCriteria.push({ key, type: 'mismatch', required: condition, actual: profileValue });
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

    // Determine Near-Miss or Possibly Eligible
    // If no failed criteria, but some criteria are unknown in profile -> "possibly_eligible"
    if (failedCriteria.length === 0 && unknownCriteria.length > 0) {
        return { 
          verdict: 'possibly_eligible', 
          failedCount: 0, 
          failedCriteria: [], 
          unknownCriteria,
          questionsToAnswer: unknownCriteria.map(k => getQuestionForMissingKey(k))
        };
    }

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

function getQuestionForMissingKey(key) {
  const map = {
    communityCategory: 'What is your community category (SC, ST, BC, MBC, Minority)?',
    workerType: 'Are you an unorganised or board-registered worker (e.g. construction, auto driver)?',
    courseLevel: 'What is your current course level (School, ITI, Diploma, UG, PG, PhD)?',
    disability: 'Do you have a disability or certificate?',
    disabilityPercent: 'What is your disability percentage?',
    target: 'Are you an owner/operator of a registered manufacturing enterprise or industrial unit?',
    income: 'What is your annual family income?',
    annualIncome: 'What is your annual family income?',
    age: 'What is your age?',
    rationCardHead: 'Who is named as head of your family on the ration card?',
    targetOccupation: 'Are you a farmer or involved in agricultural cultivation?',
    targetProfession: 'What is your professional occupation?',
    marital: 'What is your marital status (Single, Married, Widowed, Divorced)?'
  };
  return map[key] || `Please specify your ${key} to confirm eligibility`;
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
    if (failedCriterion.key === 'rationCardHead') {
        return `Must be woman head of family or wife of male head on ration card.`;
    }
    return `You do not meet the ${failedCriterion.key} requirement.`;
}

module.exports = { evaluateEligibilityExtended, generateNearMissMessage, getQuestionForMissingKey };
