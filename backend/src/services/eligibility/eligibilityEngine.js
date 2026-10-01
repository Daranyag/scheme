const { evaluateAll } = require('./eligibilityEvaluator');
const { buildResult } = require('./eligibilityResultBuilder');

const checkEligibility = (user, scheme) => {
  const criteria = evaluateAll(user, scheme);
  return buildResult(scheme, criteria);
};

module.exports = { checkEligibility };
