require('dotenv').config();
const mongoose = require('mongoose');
const Scheme = require('../models/Scheme');
const Fact = require('../models/Fact');
const { ensureDnsForUri, getMongoOptions } = require('../lib/mongo');

async function auditSchemes() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Error: MONGODB_URI is not set in environment.');
    process.exit(1);
  }

  try {
    await ensureDnsForUri(uri);
    await mongoose.connect(uri, getMongoOptions());

    const schemes = await Scheme.find({}).sort({ createdAt: 1 }).lean();
    const facts = await Fact.find({ rejected: { $ne: true } }).lean();

    // Map schemeId -> count of facts with non-empty quote
    const factCountBySchemeId = new Map();
    for (const f of facts) {
      if (f.quote && f.quote.trim().length > 0 && f.schemeId) {
        const idStr = f.schemeId.toString();
        factCountMapAdd(factCountBySchemeId, idStr);
      }
    }

    function factCountMapAdd(map, idStr) {
      map.set(idStr, (map.get(idStr) || 0) + 1);
    }

    // Group schemes by second of createdAt to detect same-second creation
    const secondCounts = new Map();
    for (const s of schemes) {
      if (s.createdAt) {
        const sec = new Date(s.createdAt).toISOString().slice(0, 19);
        secondCounts.set(sec, (secondCounts.get(sec) || 0) + 1);
      }
    }

    const tableRows = [];

    for (const s of schemes) {
      const idStr = s._id ? s._id.toString() : '';
      const numQuotedFacts = factCountBySchemeId.get(idStr) || 0;
      
      const createdBy = s.createdBy || (s.origin === 'starter' ? 'starter-schemes.json / seed.js' : 'unknown');
      const origin = s.origin || 'unknown';
      const createdAt = s.createdAt ? new Date(s.createdAt).toISOString() : 'N/A';
      const sourceUrl = s.sourceUrl || (Array.isArray(s.officialLinks) && s.officialLinks[0] ? (Array.isArray(s.officialLinks[0]) ? s.officialLinks[0][1] : s.officialLinks[0]?.url) : '') || (Array.isArray(s.links) && s.links[0] ? (Array.isArray(s.links[0]) ? s.links[0][1] : s.links[0]?.url) : '') || 'N/A';

      const flags = [];

      // Flag 1: no quoted fact
      if (numQuotedFacts === 0) {
        flags.push('no quoted fact');
      }

      // Flag 2: created in the same second as other records
      if (s.createdAt) {
        const sec = new Date(s.createdAt).toISOString().slice(0, 19);
        if ((secondCounts.get(sec) || 0) > 1) {
          flags.push('created in the same second');
        }
      }

      // Flag 3: created by a seed or test script
      const cbLower = String(createdBy).toLowerCase();
      if (cbLower.includes('seed') || cbLower.includes('test') || origin === 'starter') {
        flags.push('created by a seed or test script');
      }

      // Flag 4: placeholder text such as "Benefit for <name>"
      const benefitText = s.benefit || '';
      if (
        benefitText.toLowerCase().includes('benefit for ') ||
        benefitText.toLowerCase().includes('government benefit extracted from') ||
        (s.name && s.name.startsWith('Live Scheme from'))
      ) {
        flags.push('placeholder text');
      }

      tableRows.push({
        name: s.name,
        origin,
        'createdBy (job or script)': createdBy,
        createdAt,
        'source URL': sourceUrl.length > 35 ? sourceUrl.substring(0, 32) + '...' : sourceUrl,
        'number of quoted facts': numQuotedFacts,
        reviewStatus: s.reviewStatus || 'unknown',
        flags: flags.length > 0 ? flags.join(', ') : 'none'
      });
    }

    console.log(`\n=== SCHEMES COLLECTION AUDIT (${tableRows.length} records) ===\n`);
    console.table(tableRows);

    await mongoose.disconnect();
    return tableRows;
  } catch (err) {
    console.error('Audit failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  auditSchemes();
}

module.exports = { auditSchemes };
