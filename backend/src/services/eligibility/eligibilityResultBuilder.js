const buildResult = (scheme, criteria) => {
  let status = 'ELIGIBLE';
  let hasUnknown = false;
  
  for (const c of criteria) {
    if (c.status === 'FAIL') {
      status = 'NOT_ELIGIBLE';
      break;
    }
    if (c.status === 'UNKNOWN' || c.status === 'POTENTIALLY_ELIGIBLE') {
      hasUnknown = true;
    }
  }

  if (status !== 'NOT_ELIGIBLE' && hasUnknown) {
    status = 'POTENTIALLY_ELIGIBLE';
  }
  
  let summary = '';
  if (status === 'ELIGIBLE') summary = 'You appear to meet the published eligibility criteria.';
  else if (status === 'POTENTIALLY_ELIGIBLE') summary = 'You may be eligible, but some information is missing or unknown.';
  else summary = 'Based on the information in your profile, you do not currently meet one or more published criteria.';

  let evaluationConfidence = 'HIGH';
  if (hasUnknown) evaluationConfidence = 'MEDIUM';
  if (criteria.filter(c => c.status === 'UNKNOWN').length > 2) evaluationConfidence = 'LOW';
  
  if (evaluationConfidence === 'LOW' && status !== 'NOT_ELIGIBLE') {
    status = 'INSUFFICIENT_INFORMATION';
    summary = 'There is not enough information to determine eligibility automatically. Please check the official Tamil Nadu Government source.';
  }

  return {
    schemeId: scheme._id,
    schemeName: scheme.schemeName,
    status,
    summary,
    criteria,
    documents: scheme.documents || [],
    officialSourceUrl: scheme.officialSourceUrl,
    officialApplicationUrl: scheme.officialApplicationUrl,
    lastVerifiedAt: scheme.lastVerifiedAt || new Date().toISOString(),
    evaluationConfidence
  };
};

module.exports = { buildResult };
