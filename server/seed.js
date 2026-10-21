require('dotenv').config();
const mongoose = require('mongoose');
const Scheme = require('./models/Scheme');
const fs = require('fs');
const path = require('path');

function validateStarterSchemes(schemes, filename, allowEmpty = false) {
  if (!Array.isArray(schemes) || (!allowEmpty && schemes.length === 0)) {
    throw new Error(`Validation Error: ${filename} is empty or not an array`);
  }

  const requiredFields = ['name', 'benefit', 'rules'];

  schemes.forEach((scheme, index) => {
    const recordLabel = scheme.name || `Record at index ${index}`;
    requiredFields.forEach((field) => {
      if (scheme[field] === undefined || scheme[field] === null || scheme[field] === '') {
        throw new Error(`Validation Error in ${filename}: Record "${recordLabel}" is missing required field "${field}".`);
      }
    });

    if (typeof scheme.name === 'string' && scheme.name.startsWith('Government Scheme')) {
      throw new Error(`Validation Error in ${filename}: Record at index ${index} has fallback name "${scheme.name}". Must be real name.`);
    }

    if (typeof scheme.rules !== 'object') {
      throw new Error(`Validation Error in ${filename}: Record "${recordLabel}" field "rules" must be an object.`);
    }
  });
}

async function run() {
  const isReset = process.argv.includes('--reset');
  const filePath1 = path.join(__dirname, 'data', 'starter-schemes.json');
  const filePath2 = path.join(__dirname, 'data', 'starter-schemes-additions.json');

  if (!fs.existsSync(filePath1)) throw new Error('Missing starter-schemes.json');
  if (!fs.existsSync(filePath2)) throw new Error('Missing starter-schemes-additions.json');

  console.log('Loading starter-schemes.json...');
  const data1 = JSON.parse(fs.readFileSync(filePath1, 'utf8'));
  console.log('Validating starter-schemes.json...');
  validateStarterSchemes(data1, 'starter-schemes.json');

  console.log('Loading starter-schemes-additions.json...');
  const data2 = fs.existsSync(filePath2) ? JSON.parse(fs.readFileSync(filePath2, 'utf8')) : [];
  console.log('Validating starter-schemes-additions.json...');
  validateStarterSchemes(data2, 'starter-schemes-additions.json', true);

  const data = [...data1, ...data2];
  console.log(`Validation passed for all ${data.length} starter schemes.`);

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tn_schemes';
  const isAtlas = mongoUri.includes('mongodb.net') || mongoUri.includes('mongodb+srv');
  if (isAtlas && process.env.ALLOW_PROD_SEED !== 'true') {
    throw new Error('Safety guard: Seeding to real Atlas database blocked. Set ALLOW_PROD_SEED=true if explicitly intended.');
  }
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  if (isReset) {
    console.log('Performing seed:reset (deleting existing starter and invalid fallback records)...');
    try {
      await Scheme.collection.dropIndexes();
    } catch (e) {
      console.log('Indexes dropped or reset.');
    }
    await Scheme.deleteMany({});

    // Prepare data with schemeId, schemeName, department to prevent duplicate index errors
    const preparedData = data.map((item, idx) => ({
      ...item,
      schemeId: item.schemeId || `starter-scheme-${idx + 1}`,
      schemeName: item.schemeName || item.name,
      department: item.department || item.category || 'General',
      origin: 'starter'
    }));

    console.log('Inserting verified starter schemes...');
    await Scheme.insertMany(preparedData);
    console.log(`Successfully reset and inserted ${preparedData.length} starter schemes!`);
  } else {
    const count = await Scheme.countDocuments();
    if (count === 0) {
      console.log('Seeding initial schemes...');
      await Scheme.insertMany(data);
      console.log(`Seeded ${data.length} schemes successfully!`);
    } else {
      console.log(`Schemes collection already contains ${count} records. Skipping seed.`);
    }
  }

  process.exit(0);
}

run().catch((err) => {
  console.error('Seed execution error:', err.message);
  process.exit(1);
});
