const { TARGET_STATE } = require('../config/constants');
const { v4: uuidv4 } = require('uuid');

const normalizeScheme = (rawData, source) => {
  return {
    schemeId: rawData.schemeId || uuidv4(),
    schemeName: rawData.schemeName || 'Unknown Scheme',
    description: rawData.description || '',
    category: rawData.category || 'Other Welfare',
    department: rawData.department || '',
    
    benefit: rawData.benefit || '',
    eligibility: rawData.eligibility || '',
    documents: rawData.documents || [],
    
    officialSourceUrl: rawData.officialSourceUrl || source.sourceUrl,
    officialApplicationUrl: rawData.officialApplicationUrl || '',
    
    sourceWebsite: source.sourceUrl,
    sourceName: source.sourceName,
    sourceType: source.sourceType,
    
    state: TARGET_STATE,
    isActive: true,
    lastFetchedAt: new Date(),
    lastVerifiedAt: new Date()
  };
};

module.exports = {
  normalizeScheme
};
