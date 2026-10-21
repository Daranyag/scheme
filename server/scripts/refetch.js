#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { getLatestSnapshot, loadRecipe, executeRecipe } = require('../lib/recipes');

const args = process.argv.slice(2);
const sourceIdx = args.indexOf('--source');
const sourceId = sourceIdx !== -1 ? args[sourceIdx + 1] : 'cra_pensions';

console.log(`Refetching and re-extracting offline snapshot for source "${sourceId}"...`);
const snapshot = getLatestSnapshot(sourceId);
if (!snapshot) {
  console.log(`No offline snapshot found for source "${sourceId}". Use live verification to populate snapshots.`);
} else {
  const recipe = loadRecipe(sourceId) || { sourceId, selectors: {} };
  const res = executeRecipe(recipe, snapshot);
  console.log(`Extraction re-run completed. Completeness: ${res.completenessScore}%, Facts: ${res.facts.length}`);
}
