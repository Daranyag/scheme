const dns = require('dns');
const mongoose = require('mongoose');
const {
  classifyMongoError,
  ensureDnsForUri,
  connectAtlasWithRetries,
  initMongoConnection,
  startBackgroundAtlasRetry,
  checkAndAttemptAtlasSwitchBack,
  getDbStatus,
  stopBackgroundRetryForTesting,
  setDbStateForTesting
} = require('../lib/mongo');

const {
  setQuotaExhausted,
  isQuotaExhausted,
  resetQuotaAndBudgetForTesting,
  generateContentWithRetry
} = require('../lib/gemini');

const fetcher = require('../lib/fetcher');
const {
  fetchPage,
  resetCircuitBreakerForTesting,
  getDomainStatus
} = fetcher;

const { verifySingleScheme } = require('../services/verificationJob');

describe('1. DNS Fallback Decision and Error Classification', () => {
  let originalResolveSrv;
  let originalSetServers;
  let setServersCalledWith = null;

  beforeEach(() => {
    originalResolveSrv = dns.resolveSrv;
    originalSetServers = dns.setServers;
    setServersCalledWith = null;
    dns.setServers = (servers) => {
      setServersCalledWith = servers;
    };
  });

  afterEach(() => {
    dns.resolveSrv = originalResolveSrv;
    dns.setServers = originalSetServers;
  });

  test('Non-SRV URI does not trigger SRV resolution or modify DNS servers', async () => {
    let srvLookupCalled = false;
    dns.resolveSrv = (host, cb) => {
      srvLookupCalled = true;
      cb(null, [{ name: 'server1', port: 27017 }]);
    };

    await ensureDnsForUri('mongodb://127.0.0.1:27017/tn_schemes');
    expect(srvLookupCalled).toBe(false);
    expect(setServersCalledWith).toBeNull();
  });

  test('SRV URI with working DNS does not change DNS servers', async () => {
    dns.resolveSrv = (host, cb) => {
      cb(null, [{ name: 'shard-00-00.mongodb.net', port: 27017 }]);
    };

    await ensureDnsForUri('mongodb+srv://user:pass@cluster0.mongodb.net/test');
    expect(setServersCalledWith).toBeNull();
  });

  test('SRV URI with failing SRV lookup falls back to 8.8.8.8 and 1.1.1.1', async () => {
    dns.resolveSrv = (host, cb) => {
      cb(new Error('querySrv ENOTFOUND _mongodb._tcp.cluster0.mongodb.net'));
    };

    await ensureDnsForUri('mongodb+srv://user:pass@cluster0.mongodb.net/test');
    expect(setServersCalledWith).toEqual(['8.8.8.8', '1.1.1.1']);
  });

  test('Classifies MongoDB errors accurately without leaking credentials', () => {
    const srvErr = new Error('querySrv ENOTFOUND _mongodb._tcp.cluster0.mongodb.net');
    expect(classifyMongoError(srvErr).reason).toBe('dns_srv_failed');

    const authErr = new Error('MongoServerError: bad auth : Authentication failed.');
    expect(classifyMongoError(authErr).reason).toBe('auth_failed');

    const ipErr = new Error('Could not connect to any servers in your MongoDB Atlas cluster. One common reason is that you\'re trying to access the database from an IP that isn\'t whitelisted.');
    expect(classifyMongoError(ipErr).reason).toBe('ip_not_allowed');

    const pausedErr = new Error('MongoServerSelectionError: Cluster is paused');
    expect(classifyMongoError(pausedErr).reason).toBe('cluster_paused_or_missing');

    const timeoutErr = new Error('Server selection timed out after 20000 ms');
    timeoutErr.name = 'MongoServerSelectionError';
    expect(classifyMongoError(timeoutErr).reason).toBe('network_blocked_or_timeout');

    const customErr = new TypeError('Some custom error');
    expect(classifyMongoError(customErr).reason).toBe('other: [TypeError]');
  });
});

describe('2. Atlas Connection Retries, Fallback & Background Switch Back', () => {
  afterEach(() => {
    stopBackgroundRetryForTesting();
    jest.restoreAllMocks();
  });

  test('connectAtlasWithRetries retries 3 times before returning classified reason', async () => {
    let connectCalls = 0;
    jest.spyOn(mongoose, 'connect').mockImplementation(async () => {
      connectCalls++;
      const err = new Error('server selection timed out after 20000 ms');
      err.name = 'MongoServerSelectionError';
      throw err;
    });

    const result = await connectAtlasWithRetries('mongodb://fake-atlas:27017/db', 3, 5);
    expect(connectCalls).toBe(3);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('network_blocked_or_timeout');
  });

  test('initMongoConnection uses local fallback when Atlas fails', async () => {
    jest.spyOn(mongoose, 'connect').mockImplementation(async (uri) => {
      if (uri.includes('fake-atlas')) {
        const err = new Error('Authentication failed');
        err.code = 18;
        throw err;
      }
      return mongoose;
    });

    let seeded = false;
    const res = await initMongoConnection({
      uri: 'mongodb://fake-atlas:27017/db',
      fallbackUri: 'mongodb://127.0.0.1:27017/tn_schemes',
      fallbackEnabled: true,
      seedLocalIfEmpty: async () => { seeded = true; }
    });

    expect(res.dbMode).toBe('local');
    expect(res.dbReason).toBe('auth_failed');
    expect(seeded).toBe(true);

    const status = getDbStatus();
    expect(status.database).toBe('local');
    expect(status.dbReason).toBe('auth_failed');
  });

  test('Background retry switches back to Atlas automatically when Atlas succeeds', async () => {
    setDbStateForTesting('local', 'network_blocked_or_timeout');

    let disconnected = false;
    jest.spyOn(mongoose, 'disconnect').mockImplementation(async () => {
      disconnected = true;
    });
    jest.spyOn(mongoose, 'connect').mockImplementation(async () => {
      return mongoose;
    });

    const mockConn = {
      readyState: 1,
      close: jest.fn().mockResolvedValue(true)
    };
    jest.spyOn(mongoose, 'createConnection').mockReturnValue({
      asPromise: async () => mockConn
    });

    const switched = await checkAndAttemptAtlasSwitchBack('mongodb://working-atlas:27017/db');
    expect(switched).toBe(true);

    const status = getDbStatus();
    expect(status.database).toBe('atlas');
    expect(status.dbReason).toBe('connected_to_atlas');
    expect(disconnected).toBe(true);
    expect(mockConn.close).toHaveBeenCalled();
  });
});

describe('3. Gemini 429 Quota Stop and Awaiting AI Check State', () => {
  beforeEach(() => {
    resetQuotaAndBudgetForTesting();
  });

  afterEach(() => {
    resetQuotaAndBudgetForTesting();
    jest.restoreAllMocks();
  });

  test('Prints quota exhausted once and sets quotaExhaustedUntil', async () => {
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    const until = new Date(Date.now() + 3600000);
    await setQuotaExhausted(until);
    await setQuotaExhausted(until); // Second call should not reprint

    console.log = origLog;

    expect(isQuotaExhausted()).toBe(true);
    const printed = logs.filter(l => l.includes('AI quota exhausted until'));
    expect(printed.length).toBe(1);
    expect(printed[0]).toContain('Continuing without AI.');
  });

  test('generateContentWithRetry halts immediately when quota is active', async () => {
    await setQuotaExhausted(new Date(Date.now() + 3600000));

    await expect(
      generateContentWithRetry({ contents: 'test' })
    ).rejects.toMatchObject({
      code: 'ai_quota_exhausted',
      status: 429
    });
  });

  test('verifySingleScheme saves changed pages without AI (never "awaiting AI check")', async () => {
    await setQuotaExhausted(new Date(Date.now() + 3600000));

    jest.spyOn(fetcher, 'fetchPage').mockResolvedValue({
      ok: true,
      text: 'Newly fetched official portal text with benefits',
      finalUrl: 'https://example.gov.in/kmut',
      status: 200
    });

    const linkChecker = require('../services/linkChecker');
    jest.spyOn(linkChecker, 'checkLinks').mockResolvedValue([
      { title: 'Official Link', url: 'https://example.gov.in/kmut', linkStatus: 'ok', working: true }
    ]);

    const mockScheme = {
      _id: 'scheme123',
      name: 'Kalaignar Magalir Urimai Thogai',
      officialLinks: ['https://example.gov.in/kmut'],
      contentHash: 'old_hash',
      benefit: 'Rs 1000 per month',
      save: jest.fn().mockResolvedValue(true)
    };

    const runState = { aiQuotaExhausted: true };
    const res = await verifySingleScheme(mockScheme, runState);

    expect(mockScheme.verificationStatus).not.toBe('awaiting AI check');
    expect(['confirmed', 'partial', 'fetched_not_parsed', 'verified', 'needs better recipe']).toContain(mockScheme.verificationStatus);
    expect(res.verificationStatus).not.toBe('awaiting AI check');
  });
});

describe('4. Slow Sites, Parallel Execution and Domain Circuit Breaker', () => {
  beforeEach(() => {
    resetCircuitBreakerForTesting();
  });

  afterEach(() => {
    resetCircuitBreakerForTesting();
    jest.restoreAllMocks();
  });

  test('Trips circuit breaker after 2 consecutive timeouts and skips remaining calls', async () => {
    const axios = require('axios');
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    jest.spyOn(axios, 'get').mockImplementation(async () => {
      const err = new Error('timeout of 20000ms exceeded');
      err.code = 'ETIMEDOUT';
      throw err;
    });

    // Request 1: Times out across retries
    const res1 = await fetchPage('https://slowsite.tn.gov.in/page1', { customDelays: [5, 5] });
    expect(res1.ok).toBe(false);
    expect(res1.errorType).toBe('timeout');

    let status = getDomainStatus('slowsite.tn.gov.in');
    expect(status.consecutiveTimeouts).toBe(1);
    expect(status.status).toBe('normal');

    // Request 2: Second consecutive timeout trips circuit breaker
    const res2 = await fetchPage('https://slowsite.tn.gov.in/page2', { customDelays: [5, 5] });
    expect(res2.ok).toBe(false);

    status = getDomainStatus('slowsite.tn.gov.in');
    expect(status.consecutiveTimeouts).toBe(2);
    expect(status.status).toBe('slow');
    expect(status.isCircuitOpen).toBe(true);

    // Request 3: Circuit breaker is OPEN. Skipped immediately without network call!
    axios.get.mockClear();
    const res3 = await fetchPage('https://slowsite.tn.gov.in/page3');
    expect(res3.ok).toBe(false);
    expect(res3.errorType).toBe('timeout');
    expect(res3.errorMessage).toContain('marked slow and skipped');
    expect(axios.get).not.toHaveBeenCalled();

    console.log = origLog;
    const skippedLogs = logs.filter(l => l.includes('skipped (circuit breaker: marked slow after 2 consecutive timeouts)'));
    expect(skippedLogs.length).toBeGreaterThanOrEqual(1);
  });

  test('Different domains can execute in parallel up to limit of 3 without holding each other', async () => {
    const axios = require('axios');
    let concurrentCount = 0;
    let maxConcurrentObserved = 0;

    jest.spyOn(axios, 'get').mockImplementation(async () => {
      concurrentCount++;
      if (concurrentCount > maxConcurrentObserved) {
        maxConcurrentObserved = concurrentCount;
      }
      await new Promise(r => setTimeout(r, 20));
      concurrentCount--;
      return {
        status: 200,
        headers: { 'content-type': 'text/html' },
        data: '<html><body>Official scheme portal information</body></html>'
      };
    });

    // Launch requests for 3 distinct allowed domains concurrently
    const p1 = fetchPage('https://cms.tn.gov.in/scheme1');
    const p2 = fetchPage('https://tnsocialwelfare.tn.gov.in/scheme2');
    const p3 = fetchPage('https://adw.tn.gov.in/scheme3');

    await Promise.all([p1, p2, p3]);

    expect(maxConcurrentObserved).toBeGreaterThanOrEqual(2);
    expect(maxConcurrentObserved).toBeLessThanOrEqual(3);
  });
});
