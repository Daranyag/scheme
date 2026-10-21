const { fork } = require('child_process');
const path = require('path');
const { invalidateCache } = require('../lib/schemesCache');

let workerChild = null;
let reqIdCounter = 0;
const pendingJobs = new Map(); // id -> { resolve, reject, timer }

function startWorker() {
  if (workerChild && !workerChild.killed) {
    return workerChild;
  }

  const workerScript = path.join(__dirname, '..', 'worker.js');
  console.log('[WorkerManager] Forking background worker process...');

  workerChild = fork(workerScript, [], {
    env: {
      ...process.env,
      IS_WORKER: 'true'
    },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc']
  });

  workerChild.on('message', (msg) => {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'INVALIDATE_CACHE') {
      console.log('[WorkerManager] Received cache invalidation signal from worker. Busting in-memory cache.');
      invalidateCache();
    } else if (msg.type === 'JOB_COMPLETED') {
      const pending = pendingJobs.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        pendingJobs.delete(msg.id);
        if (msg.ok) {
          pending.resolve(msg.result);
        } else {
          pending.reject(new Error(msg.error || 'Job failed in worker'));
        }
      }
    }
  });

  workerChild.on('exit', (code, signal) => {
    console.warn(`[WorkerManager] Worker process exited (code=${code}, signal=${signal}).`);
    workerChild = null;
    
    // Fail any unresolved pending jobs
    for (const [id, pending] of pendingJobs.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`Worker exited before job ${id} completed`));
    }
    pendingJobs.clear();
  });

  workerChild.on('error', (err) => {
    console.error('[WorkerManager] Worker process error:', err.message);
  });

  return workerChild;
}

function dispatchJob(jobName, options = {}, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    if (!workerChild || workerChild.killed) {
      startWorker();
    }

    const id = `job-${Date.now()}-${++reqIdCounter}`;
    const timer = setTimeout(() => {
      pendingJobs.delete(id);
      reject(new Error(`Worker job ${jobName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    pendingJobs.set(id, { resolve, reject, timer });

    workerChild.send({
      type: 'RUN_JOB',
      id,
      job: jobName,
      options
    });
  });
}

function stopWorker() {
  if (workerChild && !workerChild.killed) {
    workerChild.kill('SIGTERM');
    workerChild = null;
  }
}

function isWorkerActive() {
  return Boolean(workerChild && !workerChild.killed);
}

module.exports = {
  startWorker,
  stopWorker,
  dispatchJob,
  isWorkerActive
};
