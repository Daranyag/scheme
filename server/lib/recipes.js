/**
 * Recipe Engine for TN Schemes
 * Manages official page recipes in server/recipes/<source>.json
 * Performs selector queries, label overrides, field mapping, and layout-change detection.
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { calculateCompleteness } = require('../lib/completeness');
const { extractAmounts, extractAges, extractIncomeLimits, extractPercentages } = require('../scrapers/fieldExtractors');
const CriteriaParser = require('../scrapers/CriteriaParser');

const RECIPES_DIR = path.join(__dirname, '..', 'recipes');
const SNAPSHOTS_DIR = path.join(__dirname, '..', 'snapshots');

if (!fs.existsSync(RECIPES_DIR)) fs.mkdirSync(RECIPES_DIR, { recursive: true });
if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });

function getRecipePath(sourceId) {
  return path.join(RECIPES_DIR, `${sourceId}.json`);
}

function loadRecipe(sourceId) {
  const p = getRecipePath(sourceId);
  if (fs.existsSync(p)) {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return null;
}

function saveRecipe(sourceId, recipeData) {
  const p = getRecipePath(sourceId);
  fs.writeFileSync(p, JSON.stringify(recipeData, null, 2), 'utf8');
}

/**
 * Saves a page snapshot (keeps up to last 5 versions)
 */
function saveSnapshot(sourceId, htmlContent) {
  if (!htmlContent) return;
  const sourceSnapshotDir = path.join(SNAPSHOTS_DIR, sourceId);
  if (!fs.existsSync(sourceSnapshotDir)) fs.mkdirSync(sourceSnapshotDir, { recursive: true });

  const timestamp = Date.now();
  const filePath = path.join(sourceSnapshotDir, `snap_${timestamp}.html`);
  fs.writeFileSync(filePath, htmlContent, 'utf8');

  // Keep last 5 snapshots only
  const allSnaps = fs.readdirSync(sourceSnapshotDir).sort().reverse();
  if (allSnaps.length > 5) {
    allSnaps.slice(5).forEach(f => {
      try { fs.unlinkSync(path.join(sourceSnapshotDir, f)); } catch (e) {}
    });
  }
}

function getLatestSnapshot(sourceId) {
  const sourceSnapshotDir = path.join(SNAPSHOTS_DIR, sourceId);
  if (!fs.existsSync(sourceSnapshotDir)) return null;
  const allSnaps = fs.readdirSync(sourceSnapshotDir).sort().reverse();
  if (allSnaps.length > 0) {
    return fs.readFileSync(path.join(sourceSnapshotDir, allSnaps[0]), 'utf8');
  }
  return null;
}

/**
 * Executes a recipe against HTML content
 */
function executeRecipe(recipe, htmlContent, url = '') {
  const $ = cheerio.load(htmlContent);
  const facts = [];
  const extracted = {};

  // 1. Selector extractions
  if (recipe.selectors) {
    for (const [field, sel] of Object.entries(recipe.selectors)) {
      const match = $(sel).first().text().trim().replace(/\s+/g, ' ');
      if (match) {
        extracted[field] = match;
        facts.push({
          field,
          value: match,
          quote: match.substring(0, 100),
          extractedBy: 'selector',
          confidence: 0.95
        });
      }
    }
  }

  // 2. Field extractors fallback/enrichment
  const pageText = $('body').text().replace(/\s+/g, ' ').trim();
  const amounts = extractAmounts(pageText);
  if (amounts.length > 0 && !extracted.benefit) {
    extracted.benefit = amounts[0].display;
    facts.push({ ...amounts[0], extractedBy: 'regex' });
  }

  const cp = new CriteriaParser();
  const criteria = cp.parse(pageText);
  extracted.rules = criteria.rules;
  criteria.facts.forEach(f => facts.push(f));

  // Completeness
  const completeness = calculateCompleteness(extracted, facts);

  // Layout change detection: if completeness falls clearly below baseline
  let isLayoutChanged = false;
  if (recipe.baselineCompleteness && completeness.score < (recipe.baselineCompleteness - 30)) {
    isLayoutChanged = true;
  }

  return {
    sourceId: recipe.sourceId,
    extracted,
    facts,
    completenessScore: completeness.score,
    missingFields: completeness.missingFields,
    isLayoutChanged,
    layoutStatus: isLayoutChanged ? 'layout_changed' : 'normal'
  };
}

async function testRecipeAgainstFixture(sourceId, htmlContent) {
  const recipe = loadRecipe(sourceId) || { sourceId, selectors: {} };
  const result = executeRecipe(recipe, htmlContent);
  return {
    ok: true,
    sourceId,
    factsCount: result.facts.length,
    completenessScore: result.completenessScore,
    result
  };
}

module.exports = {
  loadRecipe,
  saveRecipe,
  saveSnapshot,
  getLatestSnapshot,
  executeRecipe,
  testRecipeAgainstFixture,
  RECIPES_DIR,
  SNAPSHOTS_DIR
};
