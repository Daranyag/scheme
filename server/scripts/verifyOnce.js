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
    if (fs.existsSync(starterPath)) {
      const data = JSON.parse(fs.readFileSync(starterPath, 'utf8'));
      if (mongoose.connection.readyState === 1) {
        await Scheme.insertMany(data);
      }
    }
  }

  if (schemeFilter) {
    console.log(`Filtering verification for scheme matching: "${schemeFilter}"`);
  }

  const report = await runVerificationJob({ schemeFilter });

  console.log('\n===================================== FINAL VERIFICATION SUMMARY =====================================');
  console.table(report.map(r => ({
    'Scheme Name': r.name,
    'Status': r.status || r.verificationStatus,
    'Page Used': r.pageUsed ? (r.pageUsed.length > 35 ? r.pageUsed.substring(0, 32) + '...' : r.pageUsed) : 'None',
    'Quote Count': (r.differencesFound && r.differencesFound.length > 0 && r.differencesFound[0] !== 'None') ? r.differencesFound.length : 1,
    'Reason / Failure Details': r.verificationReason || r.reason || 'None'
  })));
  console.log('======================================================================================================\n');

  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
}

runVerifyOnce().catch(err => {
  console.error('Verification runner error:', err);
  process.exit(1);
});
