require('dotenv').config();
const mongoose = require('mongoose');

function sanitizeConnectionString(str) {
  if (!str) return '';
  return str.replace(/mongodb(\+srv)?:\/\/[^@]+@/g, 'mongodb$1://***:***@');
}

function classifyError(err) {
  const msg = (err && err.message) ? err.message : String(err);
  const name = (err && (err.name || err.constructor?.name)) || 'Error';
  const code = err && err.code;

  if (msg.includes('querySrv') || msg.includes('ENOTFOUND') || msg.includes('ESERVFAIL') || msg.includes('ENODATA') || msg.includes('SRV lookup')) {
    return {
      result: 'dns_srv_failed',
      fix: 'Check your internet connection, DNS configuration, or MongoDB Atlas SRV URI hostname.'
    };
  }

  if (code === 18 || msg.includes('Authentication failed') || msg.includes('auth failed') || msg.includes('bad auth')) {
    return {
      result: 'auth_failed',
      fix: 'Verify the database username and password in MONGODB_URI in your .env file.'
    };
  }

  if (msg.includes('IP is not whitelisted') || msg.includes('access list') || msg.includes('IP address') || msg.includes('whitelist') || msg.includes('Could not connect to any servers')) {
    return {
      result: 'ip_not_allowed',
      fix: 'Add your current IP address to the Network Access IP Whitelist in MongoDB Atlas.'
    };
  }

  if (msg.includes('cluster is paused') || msg.includes('tenant is paused') || msg.includes('cluster missing') || msg.includes('NoSuchBucket') || msg.includes('paused')) {
    return {
      result: 'cluster_paused_or_missing',
      fix: 'Resume your cluster in the MongoDB Atlas console or verify the cluster exists.'
    };
  }

  if (name === 'MongoServerSelectionError' || msg.includes('timed out') || msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED') || msg.includes('27017')) {
    return {
      result: 'network_blocked',
      fix: 'Check network firewall settings or ensure port 27017 is open and outbound connections are permitted.'
    };
  }

  const sanitizedMsg = sanitizeConnectionString(msg);
  return {
    result: `other: [${name}] ${sanitizedMsg}`,
    fix: 'Review the database error details and verify your MongoDB configuration in .env.'
  };
}

async function runCheckMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('Result: other: [Error] MONGODB_URI is not defined in environment');
    console.log(`Node.js version: ${process.version}`);
    console.log(`Mongoose version: ${mongoose.version}`);
    console.log('Likely fix: Define MONGODB_URI in your .env file.');
    process.exit(1);
  }

  const isAtlas = uri.includes('mongodb.net') || uri.includes('mongodb+srv');

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000
    });

    const dbName = conn.connection.db?.databaseName || conn.connection.name || 'unknown';
    const locationStr = isAtlas ? 'Atlas' : 'local';

    console.log(`Result: connected (database: "${dbName}", type: ${locationStr})`);
    console.log(`Node.js version: ${process.version}`);
    console.log(`Mongoose version: ${mongoose.version}`);
    console.log('Likely fix: No fix needed. Database connection is active and healthy.');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    const classified = classifyError(err);
    console.log(`Result: ${classified.result}`);
    console.log(`Node.js version: ${process.version}`);
    console.log(`Mongoose version: ${mongoose.version}`);
    console.log(`Likely fix: ${classified.fix}`);
    process.exit(1);
  }
}

runCheckMongo();
