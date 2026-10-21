const dns = require('dns');
const mongoose = require('mongoose');

let dbMode = 'disconnected';
let dbReason = null;
let backgroundInterval = null;
let isReconnecting = false;

function sanitizeConnectionString(str) {
  if (!str) return '';
  return str.replace(/mongodb(\+srv)?:\/\/[^@]+@/g, 'mongodb$1://***:***@');
}

/**
 * Classify MongoDB connection error into exact one-line reason and likely fix
 */
function classifyMongoError(err) {
  if (!err) {
    return {
      reason: 'other',
      fix: 'Review MongoDB connection settings.'
    };
  }

  const msg = (err.message || String(err));
  const errStr = msg.toLowerCase();
  const name = err.name || err.constructor?.name || 'Error';
  const code = err.code;

  // 1. dns_srv_failed
  if (
    errStr.includes('querysrv') ||
    errStr.includes('srv lookup') ||
    (errStr.includes('enotfound') && (errStr.includes('srv') || msg.includes('_mongodb._tcp'))) ||
    errStr.includes('eservfail') ||
    errStr.includes('enodata')
  ) {
    return {
      reason: 'dns_srv_failed',
      fix: 'DNS SRV record lookup failed. Configure reliable DNS servers (e.g. 8.8.8.8, 1.1.1.1) or use a non-SRV MONGODB_URI.'
    };
  }

  // 2. auth_failed
  if (
    code === 18 ||
    errStr.includes('authentication failed') ||
    errStr.includes('auth failed') ||
    errStr.includes('bad auth') ||
    errStr.includes('auth error')
  ) {
    return {
      reason: 'auth_failed',
      fix: 'Verify the database username and password in MONGODB_URI in your .env file.'
    };
  }

  // 3. cluster_paused_or_missing
  if (
    errStr.includes('cluster is paused') ||
    errStr.includes('tenant is paused') ||
    errStr.includes('cluster paused') ||
    errStr.includes('cluster missing') ||
    errStr.includes('nosuchbucket')
  ) {
    return {
      reason: 'cluster_paused_or_missing',
      fix: 'Resume your cluster in the MongoDB Atlas console or verify that the cluster exists.'
    };
  }

  // 4. ip_not_allowed
  if (
    errStr.includes('whitelist') ||
    errStr.includes('white list') ||
    errStr.includes('access list') ||
    errStr.includes('ip not allowed') ||
    errStr.includes('ip is not whitelisted') ||
    (errStr.includes('could not connect to any servers') && errStr.includes('whitelist'))
  ) {
    return {
      reason: 'ip_not_allowed',
      fix: 'Add your current IP address to the Network Access IP Whitelist / Access List in MongoDB Atlas (or allow 0.0.0.0/0).'
    };
  }

  // 5. network_blocked_or_timeout
  if (
    name === 'MongoServerSelectionError' ||
    name === 'MongooseServerSelectionError' ||
    errStr.includes('timed out') ||
    errStr.includes('timeout') ||
    errStr.includes('etimedout') ||
    errStr.includes('econnrefused') ||
    errStr.includes('econnreset') ||
    errStr.includes('server selection timed out') ||
    errStr.includes('could not connect to any servers')
  ) {
    return {
      reason: 'network_blocked_or_timeout',
      fix: 'Check your internet connection, firewall, or port 27017 outbound access. Verify connection timeout settings.'
    };
  }

  // 6. other (with the error class)
  return {
    reason: `other: [${name}]`,
    fix: 'Review the error details and verify your MongoDB configuration in .env.'
  };
}

/**
 * Checks SRV lookup for mongodb+srv URIs and sets DNS to 8.8.8.8, 1.1.1.1 ONLY if it fails.
 */
async function ensureDnsForUri(uri) {
  if (!uri || !uri.startsWith('mongodb+srv://')) {
    return; // Non-SRV URI or empty
  }

  try {
    const match = uri.match(/^mongodb\+srv:\/\/[^@]+@([^/?#]+)/);
    const host = match ? match[1] : uri.replace('mongodb+srv://', '').split('/')[0].split('?')[0];
    if (host) {
      await new Promise((resolve, reject) => {
        dns.resolveSrv(`_mongodb._tcp.${host}`, (err, addresses) => {
          if (err || !addresses || addresses.length === 0) {
            reject(err || new Error('No SRV records found'));
          } else {
            resolve(addresses);
          }
        });
      });
    }
  } catch (srvErr) {
    // SRV lookup failed with current DNS servers. Fallback to 8.8.8.8 and 1.1.1.1
    try {
      dns.setServers(['8.8.8.8', '1.1.1.1']);
    } catch (e) {
      // Ignore if setServers fails in constrained env
    }
  }
}

function getMongoOptions() {
  return {
    serverSelectionTimeoutMS: 20000,
    connectTimeoutMS: 20000
  };
}

function sleep(ms) {
  if (process.env.NODE_ENV === 'test') {
    return new Promise(resolve => setTimeout(resolve, 5));
  }
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Tries connecting to Atlas with 3 retries (5s pause between attempts).
 */
async function connectAtlasWithRetries(uri, maxRetries = 3, retryDelayMs = 5000) {
  let lastErr = null;
  const options = getMongoOptions();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await ensureDnsForUri(uri);
      await mongoose.connect(uri, options);
      return { success: true };
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await sleep(retryDelayMs);
      }
    }
  }

  const classified = classifyMongoError(lastErr);
  return {
    success: false,
    error: lastErr,
    reason: classified.reason,
    fix: classified.fix
  };
}

async function checkAndAttemptAtlasSwitchBack(uri) {
  if (dbMode === 'atlas' || isReconnecting) return false;
  isReconnecting = true;

  try {
    await ensureDnsForUri(uri);
    const testConn = await mongoose.createConnection(uri, getMongoOptions()).asPromise();
    if (testConn.readyState === 1) {
      await testConn.close();
      await mongoose.disconnect();
      await mongoose.connect(uri, getMongoOptions());
      dbMode = 'atlas';
      dbReason = 'connected_to_atlas';
      console.log('[MongoDB] Successfully switched connection back to Atlas');
      if (backgroundInterval) {
        clearInterval(backgroundInterval);
        backgroundInterval = null;
      }
      return true;
    }
  } catch (bgErr) {
    const classified = classifyMongoError(bgErr);
    dbReason = classified.reason;
  } finally {
    isReconnecting = false;
  }
  return false;
}

/**
 * Starts background retry every 60 seconds to switch back to Atlas.
 */
function startBackgroundAtlasRetry(uri, seedLocalIfEmpty) {
  if (backgroundInterval) return;

  backgroundInterval = setInterval(async () => {
    await checkAndAttemptAtlasSwitchBack(uri);
  }, 60000);

  if (backgroundInterval.unref) {
    backgroundInterval.unref();
  }
}

/**
 * Initializes MongoDB connection with retry, local fallback, and background Atlas reconnection.
 */
async function initMongoConnection({ uri, fallbackUri, fallbackEnabled = true, seedLocalIfEmpty }) {
  if (!uri) {
    dbMode = 'disconnected';
    dbReason = 'missing_uri';
    return { dbMode, dbReason };
  }

  const primaryResult = await connectAtlasWithRetries(uri, 3, 5000);

  if (primaryResult.success) {
    dbMode = 'atlas';
    dbReason = 'connected_to_atlas';
    console.log('MongoDB connected (atlas)');
    return { dbMode, dbReason };
  }

  // Primary connection failed after 3 retries
  dbReason = primaryResult.reason;
  console.log(`Primary MongoDB connection failed: ${primaryResult.reason}`);

  if (fallbackEnabled) {
    try {
      const localUri = fallbackUri || 'mongodb://127.0.0.1:27017/tn_schemes';
      await mongoose.connect(localUri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000
      });
      dbMode = 'local';
      console.warn('USING LOCAL DATABASE, data may differ from Atlas');
      if (typeof seedLocalIfEmpty === 'function') {
        await seedLocalIfEmpty();
      }
      // Start background reconnect every 60s
      startBackgroundAtlasRetry(uri, seedLocalIfEmpty);
    } catch (localErr) {
      dbMode = 'disconnected';
      const localClassified = classifyMongoError(localErr);
      dbReason = `local_fallback_failed (${localClassified.reason})`;
      console.error('Local MongoDB fallback failed:', localErr.message);
    }
  } else {
    dbMode = 'disconnected';
  }

  return { dbMode, dbReason };
}

function getDbStatus() {
  return {
    database: dbMode,
    dbReason: dbReason || (dbMode === 'atlas' ? 'connected_to_atlas' : 'disconnected')
  };
}

function stopBackgroundRetryForTesting() {
  if (backgroundInterval) {
    clearInterval(backgroundInterval);
    backgroundInterval = null;
  }
  isReconnecting = false;
}

function setDbStateForTesting(mode, reason) {
  dbMode = mode;
  dbReason = reason;
}

module.exports = {
  classifyMongoError,
  ensureDnsForUri,
  getMongoOptions,
  connectAtlasWithRetries,
  initMongoConnection,
  startBackgroundAtlasRetry,
  checkAndAttemptAtlasSwitchBack,
  getDbStatus,
  stopBackgroundRetryForTesting,
  setDbStateForTesting
};
