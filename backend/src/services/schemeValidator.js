const { TARGET_STATE } = require('../config/constants');

const validateScheme = (scheme) => {
  if (scheme.state !== TARGET_STATE) {
    console.warn(`Validation failed: Scheme state is ${scheme.state}, expected ${TARGET_STATE}`);
    return false;
  }
  
  if (!scheme.officialSourceUrl) {
    console.warn('Validation failed: Missing officialSourceUrl');
    return false;
  }

  if (!scheme.schemeName) {
    console.warn('Validation failed: Missing schemeName');
    return false;
  }

  return true;
};

module.exports = {
  validateScheme
};
