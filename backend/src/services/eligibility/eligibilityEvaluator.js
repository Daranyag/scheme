const rules = require('./eligibilityRules');

const evaluateAll = (user, scheme) => {
  const criteria = [];
  
  // State
  const stateEval = rules.evaluateState(user.state);
  criteria.push({ name: 'Residence', status: stateEval.status, userValue: user.state, requiredValue: 'Tamil Nadu', reason: stateEval.reason });

  // Age
  const ageReq = scheme.ageLimit || null;
  const ageEval = rules.evaluateAge(user.age, ageReq);
  const ageReqStr = ageReq ? (ageReq.min ? `${ageReq.min}+` : `Below ${ageReq.max}`) : 'Unknown';
  criteria.push({ name: 'Age', status: ageEval.status, userValue: user.age, requiredValue: ageReqStr, reason: ageEval.reason });

  // Income
  const incReq = scheme.incomeLimit ? { max: scheme.incomeLimit } : null;
  const incEval = rules.evaluateIncome(user.income, incReq);
  const incReqStr = incReq ? `Up to ₹${incReq.max}` : 'None';
  if (incEval.status !== 'NOT_APPLICABLE') {
    criteria.push({ name: 'Income', status: incEval.status, userValue: user.income ? `₹${user.income}` : null, requiredValue: incReqStr, reason: incEval.reason });
  }

  // Disability
  const disReq = scheme.disabilityEligibility;
  const disEval = rules.evaluateDisability(user.disabilityStatus, disReq);
  if (disReq || disEval.status !== 'NOT_APPLICABLE') {
    criteria.push({ name: 'Disability Status', status: disEval.status, userValue: user.disabilityStatus, requiredValue: disReq ? 'Required' : 'Not required', reason: disEval.reason });
  }

  return criteria;
};

module.exports = { evaluateAll };
