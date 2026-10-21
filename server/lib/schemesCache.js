const crypto = require('crypto');

let cachedJsonString = null;
let cachedEtag = null;
let cachedSchemes = null;

function sanitizeOfficialLinks(links) {
  if (!Array.isArray(links)) return [];
  return links.map(l => {
    if (Array.isArray(l)) return [l[0] || 'Official link', l[1] || ''];
    if (l && typeof l === 'object') {
      return {
        title: l.title || l.sourceName || 'Official Link',
        url: l.url || l.link || '',
        linkStatus: l.linkStatus || (l.working === false ? '404' : 'ok'),
        working: l.working !== false,
        checkedAt: l.checkedAt || l.verifiedAt || '',
        reason: l.reason || ''
      };
    }
    return l;
  });
}

function toLeanScheme(s) {
  const idStr = s._id ? s._id.toString() : (s.id ? s.id.toString() : '');
  return {
    id: idStr,
    _id: idStr,
    name: s.name || s.schemeName || '',
    nameTamil: s.nameTamil || '',
    category: s.category || s.department || 'General',
    benefit: s.benefit || '',
    status: s.status || 'ACTIVE',
    verify: s.verify === true,
    rules: s.rules || {},
    unmappedCriteria: Array.isArray(s.unmappedCriteria) && s.unmappedCriteria.length > 0 
      ? s.unmappedCriteria 
      : (Array.isArray(s.also) ? s.also : []),
    requiredDocuments: Array.isArray(s.requiredDocuments) && s.requiredDocuments.length > 0 
      ? s.requiredDocuments 
      : (Array.isArray(s.docs) ? s.docs : []),
    howToApply: Array.isArray(s.howToApply) && s.howToApply.length > 0 
      ? s.howToApply 
      : (Array.isArray(s.steps) ? s.steps : []),
    officialLinks: sanitizeOfficialLinks(s.officialLinks?.length ? s.officialLinks : s.links),
    department: s.department || '',
    reviewStatus: s.reviewStatus || 'approved',
    verificationStatus: s.verificationStatus || 'pending',
    displayState: s.displayState || 'never_checked',
    verificationLevel: s.verificationLevel || 'secondary-source',
    verificationReason: s.verificationReason || '',
    lastVerified: s.lastVerified || ''
  };
}

async function getLeanSchemes(SchemeModel) {
  if (cachedJsonString && cachedEtag && cachedSchemes) {
    return {
      jsonString: cachedJsonString,
      etag: cachedEtag,
      schemes: cachedSchemes
    };
  }

  const Scheme = SchemeModel || require('../models/Scheme');
  const docs = await Scheme.find({
    $and: [
      { reviewStatus: { $ne: 'pending' } },
      { reviewStatus: { $ne: 'rejected' } }
    ]
  }).lean();

  cachedSchemes = docs.map(toLeanScheme);
  cachedJsonString = JSON.stringify(cachedSchemes);
  cachedEtag = `W/"${crypto.createHash('md5').update(cachedJsonString).digest('hex')}"`;

  return {
    jsonString: cachedJsonString,
    etag: cachedEtag,
    schemes: cachedSchemes
  };
}

function invalidateCache() {
  cachedJsonString = null;
  cachedEtag = null;
  cachedSchemes = null;
}

module.exports = {
  getLeanSchemes,
  invalidateCache,
  toLeanScheme
};
