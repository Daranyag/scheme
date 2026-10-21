const cron = require('node-cron');
const Scheme = require('../models/Scheme');
const { dispatchJob, startWorker } = require('./workerManager');

async function checkAndRunStartupCrawl() {
  try {
    const newestRecord = await Scheme.findOne({ origin: 'live' }).sort({ fetchedAt: -1 });
    const now = new Date();
    const isOlderThan24Hours = !newestRecord || (now - new Date(newestRecord.fetchedAt)) > (24 * 60 * 60 * 1000);

    if (isOlderThan24Hours) {
      console.log('[Scheduler] Live data is older than 24 hours (or empty). Dispatching crawler to worker process...');
      await dispatchJob('crawler');
    } else {
      console.log('[Scheduler] Live data is fresh (fetched within last 24h). Skipping startup crawl.');
    }
  } catch (err) {
    console.error('[Scheduler] Startup crawl error:', err.message);
  }
}

function initScheduler() {
  if (process.env.ENABLE_SCHEDULER !== 'true') {
    console.log('[Scheduler] ENABLE_SCHEDULER is false. 24-hour verification & crawler cron jobs are disabled.');
    return;
  }

  // Ensure worker process is alive
  startWorker();

  console.log('[Scheduler] Initializing 24-hour verification, crawler & discovery worker cron jobs in separate worker process...');
  
  if (process.env.ENABLE_DISCOVERY === 'true') {
    setInterval(async () => {
      await dispatchJob('discovery').catch(err => console.error('[Scheduler] Discovery worker error:', err.message));
    }, 10000);
  }

  if (process.env.RUN_JOBS_ON_START === 'true') {
    setTimeout(async () => {
      if (process.env.ENABLE_DISCOVERY === 'true') {
        await dispatchJob('discovery').catch(err => console.error('[Scheduler] Startup discovery error:', err.message));
      }
      await dispatchJob('verification').catch(err => console.error('[Scheduler] Startup verification error:', err.message));
      await checkAndRunStartupCrawl();
    }, 5000);
  } else {
    console.log('[Scheduler] RUN_JOBS_ON_START is false. Startup verification & crawler skipped.');
  }

  // Schedule daily crawler & verifier job at 02:00 AM via worker process
  cron.schedule('0 2 * * *', async () => {
    console.log('[Scheduler] Triggering scheduled daily crawler & verifier job in worker process...');
    await dispatchJob('verification').catch(err => console.error('[Scheduler] Scheduled verification error:', err.message));
    await dispatchJob('crawler').catch(err => console.error('[Scheduler] Scheduled crawler error:', err.message));
  });
}

module.exports = {
  initScheduler
};
