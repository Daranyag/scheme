const DetailAdapter = require('../scrapers/DetailAdapter');
const CriteriaParser = require('../scrapers/CriteriaParser');
const translationService = require('../services/translationService');

describe('Hybrid Extraction Engine Tests', () => {
  
  describe('CriteriaParser', () => {
    let parser;
    beforeAll(() => {
      parser = new CriteriaParser();
    });

    test('should extract age condition correctly', () => {
      const text = "Beneficiary should be 60 years and above to apply.";
      const { rules, unmapped } = parser.parse(text);
      expect(rules).toHaveProperty('age');
      expect(rules.age).toHaveProperty('$gte', 60);
      expect(unmapped.length).toBe(0);
    });

    test('should extract income limit condition', () => {
      const text = "Annual income should not exceed Rs. 2,50,000";
      const { rules, unmapped } = parser.parse(text);
      expect(rules).toHaveProperty('annualIncome');
      expect(rules.annualIncome).toHaveProperty('$lte', 250000);
      expect(unmapped.length).toBe(0);
    });

    test('should extract destitute and widow conditions', () => {
      const text = "Must be a destitute widow.";
      const { rules, unmapped } = parser.parse(text);
      expect(rules).toHaveProperty('destitute', true);
      expect(rules).toHaveProperty('maritalStatus', 'widowed');
    });

    test('should place unmatched criteria in unmapped array', () => {
      const text = "Must be a resident of Tamil Nadu.";
      const { rules, unmapped } = parser.parse(text);
      expect(Object.keys(rules).length).toBe(0);
      expect(unmapped).toContain(text);
    });
  });

  describe('TranslationService', () => {
    test('should correctly identify Tamil text', () => {
      expect(translationService.isTamil('முதியோர் ஓய்வூதியம்')).toBe(true);
      expect(translationService.isTamil('Old Age Pension')).toBe(false);
    });

    test('should translate known Tamil words to English', () => {
      const translated = translationService.translateToEnglish('முதியோர் ஓய்வூதியம் திட்டம்');
      expect(translated).toBe('Old Age Pension திட்டம்');
    });
  });

  describe('DetailAdapter', () => {
    test('should extract basic eligibility conditions from detailed text', () => {
      const adapter = new DetailAdapter('To apply, you must be 60 years and above with annual income below rs. 2,50,000.', 'http://example.com');
      const sections = adapter.extractSections();
      
      expect(sections.eligibilityRules).toHaveProperty('age');
      expect(sections.eligibilityRules.age).toHaveProperty('$gte', 60);
      expect(sections.eligibilityRules).toHaveProperty('annualIncome');
      expect(sections.eligibilityRules.annualIncome).toHaveProperty('$lte', 250000);
    });
  });

});
