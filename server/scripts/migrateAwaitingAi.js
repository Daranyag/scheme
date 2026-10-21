const mongoose = require('mongoose');
const Scheme = require('../models/Scheme');
const Fact = require('../models/Fact');
const CrawlerJob = require('../models/CrawlerJob');
const { calculateCompleteness } = require('../lib/completeness');
const { presentScheme } = require('../lib/presenter');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tn_schemes';

const VALID_STATUSES = new Set([
  'verified', 'confirmed', 'differs', 'partial', 'fetched_not_parsed',
  'unreachable', 'never_checked', 'blocked', 'tls_problem', 'no_candidate_page',
  'retry_later', 'pending'
]);

async function migrateAwaitingAi() {
  console.log('[Migration] Starting migration: removing "awaiting AI" and invalid AI states across database...');
  await mongoose.connect(MONGODB_URI);
  console.log('[Migration] Connected to MongoDB.');

  // 1. Clean up CrawlerJobs awaiting AI
  try {
    const jobResult = await CrawlerJob.updateMany(
      { status: { $regex: /awaiting/i } },
      { $set: { status: 'failed', logs: [{ timestamp: new Date(), message: 'Migrated from awaiting AI' }] } }
    );
    console.log(`[Migration] Updated ${jobResult.modifiedCount} CrawlerJobs with awaiting status.`);
  } catch (err) {
    console.warn('[Migration] CrawlerJob update note:', err.message);
  }

  // 2. Query all schemes to ensure valid verificationStatus and displayState
  const schemes = await Scheme.find({});
  console.log(`[Migration] Scanning ${schemes.length} total schemes in database...`);

  let migratedCount = 0;
  for (const scheme of schemes) {
    let needsUpdate = false;
    const vStatus = scheme.verificationStatus || '';
    const vReason = scheme.verificationReason || '';
    const dState = scheme.displayState || '';

    if (!VALID_STATUSES.has(vStatus) || /ai/i.test(vStatus) || /awaiting/i.test(vStatus) || /ai/i.test(vReason) || !dState) {
      needsUpdate = true;
    }

    if (needsUpdate) {
      const facts = await Fact.find({ schemeId: scheme._id }).lean();
      const presentation = await presentScheme({ scheme, facts });
      const completeness = calculateCompleteness(scheme, facts);

      let newStatus = presentation.displayState || 'fetched_not_parsed';
      if (newStatus === 'never_checked' && scheme.rawSourceText && scheme.rawSourceText.length > 200) {
        newStatus = 'fetched_not_parsed';
      }
      if (!VALID_STATUSES.has(newStatus)) {
        newStatus = 'fetched_not_parsed';
      }

      let newReason = scheme.verificationReason;
      if (!newReason || /ai/i.test(newReason) || /awaiting/i.test(newReason)) {
        newReason = newStatus === 'fetched_not_parsed'
          ? 'details could not be read automatically'
          : 'migrated to standard display state';
      }

      scheme.verificationStatus = newStatus;
      scheme.displayState = presentation.displayState;
      scheme.verificationReason = newReason;
      scheme.completenessScore = completeness.score;
      scheme.missingFields = completeness.missingFields;

      await scheme.save();
      migratedCount++;
      console.log(`  -> Migrated "${scheme.name}" from status "${vStatus}" to displayState: "${scheme.displayState}", status: "${scheme.verificationStatus}" (completeness: ${completeness.score}%)`);
    }
  }

  console.log(`[Migration] Completed successfully. ${migratedCount} schemes migrated/normalized.`);
  await mongoose.disconnect();
}

if (require.main === module) {
  migrateAwaitingAi()
    .then(() => {
      console.log('[Migration] Done.');
      process.exit(0);
    })
    .catch(err => {
      console.error('[Migration] Failed:', err);
      process.exit(1);
    });
}

module.exports = { migrateAwaitingAi };
