/**
 * Text and Fact Normalizer
 * Normalizes text, amounts, numbers, and Tamil digits before comparing to prevent false "differs".
 */

const TAMIL_DIGITS_MAP = {
  '௦': '0', '௧': '1', '௨': '2', '௩': '3', '௪': '4',
  '௫': '5', '௬': '6', '௭': '7', '௮': '8', '௯': '9'
};

/**
 * Replaces Tamil numerals with standard ASCII digits
 */
function replaceTamilDigits(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[௦-௯]/g, d => TAMIL_DIGITS_MAP[d] || d);
}

/**
 * Normalizes monetary amounts (e.g. "Rs.1,000/-", "₹1,000", "1000", "Rs 1000") to numeric integer value
 */
function parseNormalizedAmount(val) {
  if (typeof val === 'number') return val;
  if (!val || typeof val !== 'string') return null;

  const asciiStr = replaceTamilDigits(val);
  // First attempt to match an explicit currency prefix (₹, rs, inr, ரூ)
  const currencyMatch = asciiStr.match(/(?:₹|rs\.?|inr|ரூ\.?)\s*([\d,]+)(?:\s*\/-)?/i);
  if (currencyMatch && currencyMatch[1]) {
    const parsed = parseInt(currencyMatch[1].replace(/,/g, ''), 10);
    return isNaN(parsed) ? null : parsed;
  }

  // If no currency symbol found, only match if the string is primarily a number
  const standaloneMatch = asciiStr.trim().match(/^([\d,]+)(?:\s*\/-)?$/);
  if (standaloneMatch && standaloneMatch[1]) {
    const parsed = parseInt(standaloneMatch[1].replace(/,/g, ''), 10);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Normalizes text for comparison:
 * - Converts Tamil digits to ASCII
 * - Lowercases and trims
 * - Collapses whitespace
 * - Standardizes currency notation ("rs.1,000/-" -> "₹1000")
 * - Removes non-semantic punctuation
 */
function normalizeText(str) {
  if (!str) return '';
  if (typeof str !== 'string') str = String(str);

  let s = replaceTamilDigits(str).toLowerCase().trim();
  // Standardize currencies
  s = s.replace(/(?:rs\.?|inr|ரூ\.?)\s*([\d,]+)(?:\s*\/-)?/gi, '₹$1');
  // Strip commas inside digits
  s = s.replace(/(\d+),(\d+)/g, '$1$2');
  // Collapse whitespace and punctuation
  s = s.replace(/[\/\\\-_.,;:!?'"()[\]{}]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Checks if two values are semantically different.
 * Returns true ONLY when actual values (number, date, status, age, income limit, meaning) change.
 */
function areValuesDifferent(oldVal, newVal, field = 'generic') {
  if (oldVal === newVal) return false;
  if (oldVal === null || oldVal === undefined) return Boolean(newVal);
  if (newVal === null || newVal === undefined) return Boolean(oldVal);

  let isDiff = false;
  if (field === 'benefit' || field === 'amount') {
    const oldAmt = parseNormalizedAmount(oldVal);
    const newAmt = parseNormalizedAmount(newVal);
    if (oldAmt !== null && newAmt !== null) {
      isDiff = oldAmt !== newAmt;
    } else {
      isDiff = normalizeText(oldVal) !== normalizeText(newVal);
    }
  } else if (field === 'age' || field === 'ageMin') {
    const getAge = (v) => typeof v === 'object' ? (v.$gte || v.$lte || null) : parseInt(v, 10);
    const a1 = getAge(oldVal);
    const a2 = getAge(newVal);
    if (a1 !== null && a2 !== null) isDiff = a1 !== a2;
    else isDiff = normalizeText(oldVal) !== normalizeText(newVal);
  } else if (field === 'annualIncome' || field === 'incomeLimit') {
    const getInc = (v) => typeof v === 'object' ? (v.$lte || v.$lt || null) : parseInt(v, 10);
    const i1 = getInc(oldVal);
    const i2 = getInc(newVal);
    if (i1 !== null && i2 !== null) isDiff = i1 !== i2;
    else isDiff = normalizeText(oldVal) !== normalizeText(newVal);
  } else if (field === 'applicationStatus') {
    isDiff = String(oldVal).toLowerCase().trim() !== String(newVal).toLowerCase().trim();
  } else if (typeof oldVal === 'object' && typeof newVal === 'object') {
    isDiff = JSON.stringify(oldVal) !== JSON.stringify(newVal);
  } else {
    // Compare normalized string representations
    const normOld = normalizeText(oldVal);
    const normNew = normalizeText(newVal);
    isDiff = normOld !== normNew;
  }

  if (isDiff) {
    console.log(`[DiffDetected] Field "${field}" changed. Old: ${JSON.stringify(oldVal)} | New: ${JSON.stringify(newVal)}`);
  }
  return isDiff;
}

module.exports = {
  replaceTamilDigits,
  parseNormalizedAmount,
  normalizeText,
  areValuesDifferent
};
