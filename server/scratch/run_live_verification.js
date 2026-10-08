require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Scheme = require('../models/Scheme');
const { runVerificationJob } = require('../services/verificationJob');

async function run() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tn_schemes';
  console.log('Connecting to MongoDB:', mongoUri);

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    console.log('Connected to MongoDB.');
  } catch (err) {
    console.log('MongoDB connection failed. Running in-memory mock mode...');
  }

  // Ensure schemes exist
  let schemesCount = 0;
  if (mongoose.connection.readyState === 1) {
    schemesCount = await Scheme.countDocuments();
  }

  if (schemesCount === 0) {
    console.log('No scheme records found in database. Seeding starter schemes...');
    const filePath = path.join(__dirname, '..', 'data', 'starter-schemes.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (mongoose.connection.readyState === 1) {
        await Scheme.insertMany(data);
      } else {
        // mock in memory if mongo not running
        for (const item of data) {
          const s = new Scheme(item);
          Scheme.find = async () => data.map(d => new Scheme(d));
        }
      }
    }
  }

  console.log('\n--- Running Verification Job ---\n');
  const report = await runVerificationJob();

  console.log('\n================ FULL VERIFICATION REPORT ================');
  console.log(JSON.stringify(report, null, 2));
  console.log('==========================================================\n');

  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
}

run().catch(err => {
  console.error('Error running verification job script:', err);
  process.exit(1);
});
