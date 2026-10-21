#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { loadRecipe, executeRecipe, getLatestSnapshot } = require('../lib/recipes');

const args = process.argv.slice(2);
const sourceIdx = args.indexOf('--source');
if (sourceIdx === -1 || !args[sourceIdx + 1]) {
  console.log('Usage: npm run recipe:test -- --source <id> [--url <page>]');
  process.exit(1);
}

const sourceId = args[sourceIdx + 1];
const recipe = loadRecipe(sourceId) || { sourceId, selectors: {}, baselineCompleteness: 70 };
const snapshot = getLatestSnapshot(sourceId) || '<html><body><h1>Government Welfare Scheme</h1><p>Financial assistance of ₹1,000 per month for eligible citizens aged 60 and above.</p></body></html>';

const result = executeRecipe(recipe, snapshot);

console.log('============================ RECIPE TEST RESULT ============================');
console.log(`Source: ${sourceId}`);
console.log(`Completeness Score: ${result.completenessScore}%`);
console.log(`Missing Fields: ${result.missingFields.join(', ') || 'None'}`);
console.log(`Layout Status: ${result.layoutStatus}`);
console.log('Extracted Facts:');
console.table(result.facts.map(f => ({
  Field: f.field,
  Value: typeof f.value === 'object' ? JSON.stringify(f.value) : f.value,
  Method: f.extractedBy,
  Confidence: f.confidence,
  Quote: (f.quote || '').substring(0, 40)
})));
console.log('============================================================================');
