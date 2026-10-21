require('../lib/networkGuard');
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Scheme = require('../models/Scheme');
const { runVerificationJob } = require('../services/verificationJob');

async function runVerifyOnce() {
  console.log('========================================================================================');
  console.log('                            TN SCHEMES VERIFICATION RUNNER                              ');
  console.log('========================================================================================\n');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tn_schemes';
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    console.log('Connected to MongoDB.');
  } catch (err) {
    console.log('MongoDB unavailable. Using memory mode...');
  }

  // Parse CLI flags
  const args = process.argv.slice(2);
  let schemeFilter = null;
  const schemeIdx = args.indexOf('--scheme');
  if (schemeIdx !== -1 && args[schemeIdx + 1]) {
    schemeFilter = args[schemeIdx + 1];
  }

  // Ensure schemes collection has starter schemes if empty
  let count = 0;
  if (mongoose.connection.readyState === 1) {
    count = await Scheme.countDocuments();
  }

  if (count === 0) {
    console.log('Seeding initial schemes from starter-schemes.json...');
    const starterPath = path.join(__dirname, '..', 'data', 'starter-schemes.json');
    const additionsPath = path.join(__dirname, '..', 'data', 'starter-schemes-additions.json');
    let data = [];
    if (fs.existsSync(starterPath)) {
      data = [...data, ...JSON.parse(fs.readFileSync(starterPath, 'utf8'))];
    }
    if (fs.existsSync(additionsPath)) {
      data = [...data, ...JSON.parse(fs.readFileSync(additionsPath, 'utf8'))];
    }
    if (data.length > 0 && mongoose.connection.readyState === 1) {
      await Scheme.insertMany(data);
    }
  }

  if (schemeFilter) {
    console.log(`Filtering verification for scheme matching: "${schemeFilter}"`);
  }

  const Fact = require('../models/Fact');
  const report = await runVerificationJob({ schemeFilter });

  console.log('\n===================================== FINAL VERIFICATION SUMMARY =====================================');
  console.table(report.map(r => ({
    'Scheme Name': r.name,
    'Status': r.status || r.verificationStatus,
    'Page Used': r.pageUsed ? (r.pageUsed.length > 35 ? r.pageUsed.substring(0, 32) + '...' : r.pageUsed) : 'None',
    'Differences': r.differencesFound ? r.differencesFound.join('; ') : 'None',
    'Reason': r.verificationReason || r.reason || 'None'
  })));
  console.log('======================================================================================================\n');

  // Print Schemes breakdown by display state & verification status
  const confirmed = report.filter(r => (r.status === 'confirmed' || r.status === 'verified'));
  const differs = report.filter(r => r.status === 'differs');
  const partialOrNotParsed = report.filter(r => r.status === 'partial' || r.status === 'fetched_not_parsed');
  const unreachable = report.filter(r => r.status === 'unreachable' || r.status === 'tls_problem' || r.status === 'blocked');

  console.log('--------------------------------- SCHEMES STATUS BREAKDOWN ---------------------------------');
  console.log(`CONFIRMED SCHEMES (${confirmed.length}):`, confirmed.map(c => c.name).join(', ') || 'None');
  console.log(`DIFFERING SCHEMES (${differs.length}):`, differs.map(d => `${d.name} (${d.differencesFound?.join(', ')})`).join(', ') || 'None');
  console.log(`PARTIAL / FETCHED NOT PARSED (${partialOrNotParsed.length}):`, partialOrNotParsed.map(p => `${p.name} [Page: ${p.pageUsed || 'None'}]`).join(', ') || 'None');
  console.log(`UNREACHABLE / FAILED (${unreachable.length}):`, unreachable.map(u => `${u.name} [Reason: ${u.verificationReason || u.reason || 'Failed'}]`).join(', ') || 'None');
  console.log('--------------------------------------------------------------------------------------------\n');

  // Print Saved Facts with quotes and methods
  if (mongoose.connection.readyState === 1) {
    try {
      const savedFacts = await Fact.find().populate('schemeId', 'name').sort({ createdAt: -1 }).limit(50);
      console.log('---------------------------- FACTS SAVED WITH QUOTES & METHODS -----------------------------');
      if (savedFacts.length > 0) {
        console.table(savedFacts.map(f => ({
          'Scheme': f.schemeId?.name || 'Unknown',
          'Field': f.field,
          'Value': typeof f.value === 'object' ? JSON.stringify(f.value) : f.value,
          'Method': f.extractedBy,
          'Confidence': `${f.confidence}%`,
          'Quote': f.quote ? (f.quote.length > 40 ? f.quote.substring(0, 37) + '...' : f.quote) : 'None'
        })));
      } else {
        console.log('No new facts recorded in Fact ledger.');
      }
      console.log('--------------------------------------------------------------------------------------------\n');
    } catch (e) {}
  }

  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
}

runVerifyOnce().catch(err => {
  console.error('Verification runner error:', err);
  process.exit(1);
});
