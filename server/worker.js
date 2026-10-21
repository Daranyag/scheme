require('dotenv').config();
const mongoose = require('mongoose');
const { initMongoConnection } = require('./lib/db');
const { runVerificationJob } = require('./services/verificationJob');
const { runLiveCrawler } = require('./crawlerService');
const { processDiscoveryJobs } = require('./services/discoveryService');

let isConnected = false;
let isJobRunning = false;

// Initialize isolated MongoDB connection for worker process
async function initWorkerDb() {
  if (isConnected && mongoose.connection.readyState === 1) return;
  await initMongoConnection({
    uri: process.env.MONGODB_URI,
    fallbackUri: 'mongodb://127.0.0.1:27017/tn_schemes',
    fallbackEnabled: process.env.MONGODB_FALLBACK !== 'false'
  });
  isConnected = true;
  console.log('[WorkerProcess] Worker connected to MongoDB independently.');
}

async function executeJob(jobName, options = {}) {
  // Low concurrency guard: run jobs strictly sequentially
  while (isJobRunning) {
    await new Promise(r => setTimeout(r, 200));
  }

  isJobRunning = true;
  const startTime = Date.now();
  console.log(`[WorkerProcess] Starting ${jobName} job with low concurrency...`);

  try {
    await initWorkerDb();
    let result = null;

    if (jobName === 'verification') {
      result = await runVerificationJob(options);
    } else if (jobName === 'crawler') {
      result = await runLiveCrawler(options);
    } else if (jobName === 'discovery') {
      result = await processDiscoveryJobs();
    } else {
      throw new Error(`Unknown job type: ${jobName}`);
    }

    const duration = Date.now() - startTime;
    console.log(`[WorkerProcess] Finished ${jobName} in ${duration}ms.`);

    // Notify parent process to invalidate main API cache
    if (process.send) {
      process.send({ type: 'INVALIDATE_CACHE', job: jobName });
    }

    return result;
  } finally {
    isJobRunning = false;
  }
}

// IPC listener for parent process commands
if (process.send) {
  process.on('message', async (msg) => {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'RUN_JOB') {
      try {
        const result = await executeJob(msg.job, msg.options || {});
        process.send({
          type: 'JOB_COMPLETED',
          id: msg.id,
          ok: true,
          result
        });
      } catch (err) {
        console.error(`[WorkerProcess] Error in job ${msg.job}:`, err.message);
        process.send({
          type: 'JOB_COMPLETED',
          id: msg.id,
          ok: false,
          error: err.message
        });
      }
    }
  });

  console.log('[WorkerProcess] Dedicated worker process started and waiting for IPC tasks.');
}

// Support CLI execution: node worker.js --job=verification
if (require.main === module && !process.send) {
  const args = process.argv.slice(2);
  const jobArg = args.find(a => a.startsWith('--job='));
  const job = jobArg ? jobArg.split('=')[1] : 'verification';

  executeJob(job)
    .then(() => {
      console.log('[WorkerProcess] CLI execution complete.');
      process.exit(0);
    })
    .catch(err => {
      console.error('[WorkerProcess] CLI execution failed:', err);
      process.exit(1);
    });
}

module.exports = {
  executeJob
};
