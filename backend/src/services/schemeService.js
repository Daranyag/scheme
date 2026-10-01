const craPensionSource = require('./sources/craPensionSource');
const esevaiSource = require('./sources/esevaiSource');
const schemeNormalizer = require('./schemeNormalizer');
const schemeValidator = require('./schemeValidator');
const schemeDeduplicator = require('./schemeDeduplicator');
const Scheme = require('../models/Scheme');
const FetchLog = require('../models/FetchLog');

const fetchAllSources = async () => {
  const sources = [craPensionSource, esevaiSource];
  const results = {
    totalAttempted: 0,
    totalSaved: 0,
    totalFailed: 0,
    sourceDetails: []
  };

  for (const source of sources) {
    const startTime = Date.now();
    const sourceResult = {
      sourceName: source.sourceName,
      status: 'SUCCESS',
      recordsFetched: 0,
      recordsSaved: 0,
      errorMessage: null,
      durationMs: 0
    };

    try {
      const rawData = await source.fetchSchemes();
      sourceResult.recordsFetched = rawData.length;

      for (const item of rawData) {
        results.totalAttempted++;
        try {
          const normalized = schemeNormalizer.normalizeScheme(item, source);
          if (schemeValidator.validateScheme(normalized)) {
            await schemeDeduplicator.upsertScheme(normalized);
            sourceResult.recordsSaved++;
            results.totalSaved++;
          }
        } catch (err) {
          console.error(`Error processing scheme from ${source.sourceName}:`, err.message);
        }
      }
    } catch (err) {
      sourceResult.status = 'FAILED';
      sourceResult.errorMessage = err.message;
      results.totalFailed++;
    }

    sourceResult.durationMs = Date.now() - startTime;
    
    // Save to Data Monitoring Log
    await FetchLog.create(sourceResult);
    
    results.sourceDetails.push(sourceResult);
  }

  return results;
};

module.exports = {
  fetchAllSources
};
