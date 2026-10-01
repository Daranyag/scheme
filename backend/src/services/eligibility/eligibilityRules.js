const evaluateAge = (userAge, schemeAgeCriteria) => {
  if (!schemeAgeCriteria || (!schemeAgeCriteria.min && !schemeAgeCriteria.max)) {
    return { status: 'UNKNOWN', reason: 'Official age requirement not published.' };
  }
  if (userAge === undefined || userAge === null) {
    return { status: 'POTENTIALLY_ELIGIBLE', reason: 'Your age is missing from profile.' };
  }
  
  if (schemeAgeCriteria.min && userAge < schemeAgeCriteria.min) {
    return { status: 'FAIL', reason: `Requires minimum age of ${schemeAgeCriteria.min}.` };
  }
  if (schemeAgeCriteria.max && userAge > schemeAgeCriteria.max) {
    return { status: 'FAIL', reason: `Requires maximum age of ${schemeAgeCriteria.max}.` };
  }
  return { status: 'PASS', reason: 'Age meets the published requirement.' };
};

const evaluateIncome = (userIncome, schemeIncomeCriteria) => {
  if (!schemeIncomeCriteria || schemeIncomeCriteria.max === undefined) {
    return { status: 'NOT_APPLICABLE', reason: 'No income limit published.' };
  }
  if (userIncome === undefined || userIncome === null) {
    return { status: 'POTENTIALLY_ELIGIBLE', reason: 'Your income is missing from profile.' };
  }
  if (userIncome > schemeIncomeCriteria.max) {
    return { status: 'FAIL', reason: `Income exceeds the limit of ₹${schemeIncomeCriteria.max}.` };
  }
  return { status: 'PASS', reason: 'Income is within published limits.' };
};

const evaluateDisability = (userDisability, schemeDisabilityReq) => {
  if (!schemeDisabilityReq) {
    return { status: 'NOT_APPLICABLE', reason: 'No specific disability requirement published.' };
  }
  if (!userDisability) {
    return { status: 'POTENTIALLY_ELIGIBLE', reason: 'Disability status missing from profile.' };
  }
  if (schemeDisabilityReq === true && userDisability !== 'Yes') {
    return { status: 'FAIL', reason: 'Scheme requires differently abled status.' };
  }
  return { status: 'PASS', reason: 'Disability requirement met.' };
};

const evaluateState = (userState) => {
  if (userState !== 'Tamil Nadu') {
    return { status: 'FAIL', reason: 'Only residents of Tamil Nadu are eligible.' };
  }
  return { status: 'PASS', reason: 'Tamil Nadu residence verified.' };
};

module.exports = { evaluateAge, evaluateIncome, evaluateDisability, evaluateState };
