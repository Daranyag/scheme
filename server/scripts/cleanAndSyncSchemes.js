require('dotenv').config();
const mongoose = require('mongoose');
const Scheme = require('../models/Scheme');
const Fact = require('../models/Fact');
const { ensureDnsForUri, getMongoOptions } = require('../lib/mongo');
const { invalidateCache } = require('../lib/schemesCache');

async function cleanAndSyncSchemes() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Error: MONGODB_URI missing.');
    process.exit(1);
  }

  await ensureDnsForUri(uri);
  await mongoose.connect(uri, getMongoOptions());

  console.log('Connected to MongoDB. Running cleanup and merge...');

  // 1. Ensure e-Sevai Application Channel exists in schemes collection as rejected
  let eSevai = await Scheme.findOne({ name: 'e-Sevai Application Channel' });
  if (!eSevai) {
    eSevai = new Scheme({
      name: 'e-Sevai Application Channel',
      nameTamil: 'இ-சேவை விண்ணப்ப மையம்',
      category: 'Service Channel',
      benefit: 'Benefit for e-Sevai Application Channel',
      status: 'INACTIVE',
      origin: 'live',
      createdBy: 'discoveryService',
      sourceUrl: 'https://www.tnesevai.tn.gov.in/',
      reviewStatus: 'rejected',
      rejectionReason: 'Service channel / portal entry without official scheme page quote',
      rules: {},
      unmappedCriteria: [],
      requiredDocuments: [],
      howToApply: []
    });
    await eSevai.save();
    console.log('Added e-Sevai Application Channel as rejected.');
  } else {
    eSevai.reviewStatus = 'rejected';
    eSevai.rejectionReason = 'Service channel / portal entry without official scheme page quote';
    if (!eSevai.createdBy) eSevai.createdBy = 'discoveryService';
    await eSevai.save();
  }

  // 2. Link existing facts with schemeIds
  const allSchemes = await Scheme.find({});
  const allFacts = await Fact.find({});
  for (const s of allSchemes) {
    const urls = [
      s.sourceUrl,
      ...(s.officialLinks || []).map(l => (Array.isArray(l) ? l[1] : l?.url)),
      ...(s.links || []).map(l => (Array.isArray(l) ? l[1] : l?.url))
    ].filter(Boolean);

    for (const f of allFacts) {
      if (urls.some(u => u && (f.sourceUrl.includes(u) || u.includes(f.sourceUrl)))) {
        if (f.schemeId?.toString() !== s._id.toString()) {
          f.schemeId = s._id;
          await f.save();
        }
      }
    }
  }

  // 3. Count quoted facts for each scheme
  const freshFacts = await Fact.find({ rejected: { $ne: true } }).lean();
  const factCountMap = new Map();
  for (const f of freshFacts) {
    if (f.quote && f.quote.trim().length > 0 && f.schemeId) {
      const idStr = f.schemeId.toString();
      factCountMap.set(idStr, (factCountMap.get(idStr) || 0) + 1);
    }
  }

  // 4. Update reviewStatus: records with NO official page quote are set to rejected
  for (const s of allSchemes) {
    const quotes = factCountMap.get(s._id.toString()) || 0;
    if (quotes === 0) {
      s.reviewStatus = 'rejected';
      if (!s.rejectionReason) {
        s.rejectionReason = s.name === 'Thalapathy Vijay Education Award'
          ? 'no official government page (non-official initiative)'
          : 'no official page quote';
      }
      await s.save();
      console.log(`Set rejected for scheme with 0 quotes: "${s.name}"`);
    } else {
      s.reviewStatus = 'approved';
      await s.save();
      console.log(`Approved scheme with ${quotes} quoted facts: "${s.name}"`);
    }
  }

  // 5. Merge Unemployment Assistance Scheme and State Government Employees Pension Scheme aliases
  const pensionScheme = await Scheme.findOne({ name: 'State Government Employees Pension Scheme' });
  if (pensionScheme) {
    const pensionAliases = [
      'TAPS',
      'Tamil Nadu Government Pensioners Scheme',
      'Old Pension Scheme',
      'CPS',
      'Tamil Nadu Pensioners Scheme',
      'Government employee pension'
    ];
    pensionScheme.aliases = Array.from(new Set([...(pensionScheme.aliases || []), ...pensionAliases]));
    await pensionScheme.save();
    console.log('Updated aliases for State Government Employees Pension Scheme:', pensionScheme.aliases);
  }

  const unemployScheme = await Scheme.findOne({ name: 'Unemployment Assistance Scheme' });
  if (unemployScheme) {
    const unemployAliases = [
      'வேலையில்லா உதவித்தொகை',
      'Youth Unemployment Allowance',
      'unemployment allowance',
      'Unemployment Assistance Scheme'
    ];
    unemployScheme.aliases = Array.from(new Set([...(unemployScheme.aliases || []), ...unemployAliases]));
    await unemployScheme.save();
    console.log('Updated aliases for Unemployment Assistance Scheme:', unemployScheme.aliases);
  }

  // Deduplicate if multiple documents exist with matching names or aliases
  const pensionDocs = await Scheme.find({ name: 'State Government Employees Pension Scheme' });
  if (pensionDocs.length > 1) {
    for (let i = 1; i < pensionDocs.length; i++) {
      await Scheme.deleteOne({ _id: pensionDocs[i]._id });
    }
    console.log(`Deduplicated: removed ${pensionDocs.length - 1} duplicate pension scheme docs.`);
  }

  const unemployDocs = await Scheme.find({ name: 'Unemployment Assistance Scheme' });
  if (unemployDocs.length > 1) {
    for (let i = 1; i < unemployDocs.length; i++) {
      await Scheme.deleteOne({ _id: unemployDocs[i]._id });
    }
    console.log(`Deduplicated: removed ${unemployDocs.length - 1} duplicate unemployment scheme docs.`);
  }

  invalidateCache();
  console.log('Cache invalidated. Cleanup complete.');
  await mongoose.disconnect();
}

cleanAndSyncSchemes().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
