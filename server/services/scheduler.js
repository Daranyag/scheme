const cron = require('node-cron');
const { runVerificationJob } = require('./verificationJob');
const { runLiveCrawler } = require('./crawlerService');
const Scheme = require('../models/Scheme');

const { processDiscoveryJobs } = require('./discoveryService');

async function checkAndRunStartupCrawl() {
  try {
    const newestRecord = await Scheme.findOne({ origin: 'live' }).sort({ fetchedAt: -1 });
    const now = new Date();
    const isOlderThan24Hours = !newestRecord || (now - new Date(newestRecord.fetchedAt)) > (24 * 60 * 60 * 1000);

    if (isOlderThan24Hours) {
      console.log('[Scheduler] Live data is older than 24 hours (or empty). Running crawler...');
      await runLiveCrawler();
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

  console.log('[Scheduler] Initializing 24-hour verification, crawler & discovery worker cron jobs...');
  
  if (process.env.ENABLE_DISCOVERY === 'true') {
    setInterval(async () => {
      await processDiscoveryJobs().catch(err => console.error('[Scheduler] Discovery worker error:', err.message));
    }, 10000);
  }

  setTimeout(async () => {
    if (process.env.ENABLE_DISCOVERY === 'true') {
      await processDiscoveryJobs().catch(err => console.error('[Scheduler] Startup discovery error:', err.message));
    }
    await runVerificationJob().catch(err => console.error('[Scheduler] Startup verification error:', err.message));
    await checkAndRunStartupCrawl();
  }, 5000);

  // Schedule daily crawler & verifier job at 02:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('[Scheduler] Triggering scheduled daily crawler & verifier job...');
    await runVerificationJob().catch(err => console.error('[Scheduler] Scheduled verification error:', err.message));
    await runLiveCrawler().catch(err => console.error('[Scheduler] Scheduled crawler error:', err.message));
  });
}

module.exports = {
  initScheduler
};
