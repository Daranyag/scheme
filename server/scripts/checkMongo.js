require('dotenv').config();
const mongoose = require('mongoose');
const { classifyMongoError, ensureDnsForUri, getMongoOptions } = require('../lib/mongo');

async function runCheckMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('Result: other: [Error]');
    console.log(`Node.js version: ${process.version}`);
    console.log(`Mongoose version: ${mongoose.version}`);
    console.log('Likely fix: Define MONGODB_URI in your .env file.');
    process.exit(1);
  }

  const isAtlas = uri.includes('mongodb.net') || uri.includes('mongodb+srv');

  try {
    await ensureDnsForUri(uri);
    const conn = await mongoose.connect(uri, getMongoOptions());

    const dbName = conn.connection.db?.databaseName || conn.connection.name || 'unknown';
    const locationStr = isAtlas ? 'Atlas' : 'local';

    console.log(`Result: connected (database: "${dbName}", type: ${locationStr})`);
    console.log(`Node.js version: ${process.version}`);
    console.log(`Mongoose version: ${mongoose.version}`);
    console.log('Likely fix: No fix needed. Database connection is active and healthy.');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    const classified = classifyMongoError(err);
    console.log(`Result: ${classified.reason}`);
    console.log(`Node.js version: ${process.version}`);
    console.log(`Mongoose version: ${mongoose.version}`);
    console.log(`Likely fix: ${classified.fix}`);
    process.exit(1);
  }
}

runCheckMongo();
