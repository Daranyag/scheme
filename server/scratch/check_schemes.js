require('dotenv').config();
const mongoose = require('mongoose');
const Scheme = require('../models/Scheme');

async function checkSchemes() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tn_schemes');
  const schemes = await Scheme.find({
    $and: [
      { reviewStatus: { $ne: 'pending' } },
      { reviewStatus: { $ne: 'rejected' } }
    ]
  }).lean();

  console.log('TOTAL_SCHEMES_IN_DB:', schemes.length);
  console.log('FIRST_2_RECORDS_RAW_JSON:');
  console.log(JSON.stringify(schemes.slice(0, 2), null, 2));
  process.exit(0);
}

checkSchemes().catch(err => {
  console.error(err);
  process.exit(1);
});
