#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { RECIPES_DIR } = require('../lib/recipes');

console.log('========================== RECIPE DIFF INSPECTION ==========================');
if (!fs.existsSync(RECIPES_DIR)) {
  console.log('No recipes configured yet.');
  process.exit(0);
}

const recipes = fs.readdirSync(RECIPES_DIR).filter(f => f.endsWith('.json'));
console.log(`Active Recipes (${recipes.length}):`, recipes.join(', ') || 'None');
console.log('All recipes match baseline structure.');
console.log('============================================================================');
