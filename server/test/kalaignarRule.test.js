const { evaluateEligibilityExtended } = require('../services/ruleEngine');

describe('Kalaignar Magalir Urimai Thogai rule tests', () => {
  const kmutRules = {
    gender: 'F',
    age: { $gte: 21 },
    rationCardHead: { $in: ['self', 'spouse'] },
    income: { $lt: 250000 },
    govtEmployeeInFamily: false,
    taxPayer: false,
    fourWheeler: false
  };

  test('age 20 -> not eligible', () => {
    const profile = {
      gender: 'F',
      age: 20,
      rationCardHead: 'spouse',
      income: 100000,
      govtEmployeeInFamily: false,
      taxPayer: false,
      fourWheeler: false
    };
    const result = evaluateEligibilityExtended(profile, kmutRules);
    expect(result.verdict).toBe('near_miss'); // Only age failed, age is mutable
    expect(result.failedCriteria.some(f => f.key === 'age')).toBe(true);
  });

  test('age 21 -> eligible', () => {
    const profile = {
      gender: 'F',
      age: 21,
      rationCardHead: 'spouse',
      income: 100000,
      govtEmployeeInFamily: false,
      taxPayer: false,
      fourWheeler: false
    };
    const result = evaluateEligibilityExtended(profile, kmutRules);
    expect(result.verdict).toBe('eligible');
  });

  test('income 249,999 -> eligible', () => {
    const profile = {
      gender: 'F',
      age: 25,
      rationCardHead: 'self',
      income: 249999,
      govtEmployeeInFamily: false,
      taxPayer: false,
      fourWheeler: false
    };
    const result = evaluateEligibilityExtended(profile, kmutRules);
    expect(result.verdict).toBe('eligible');
  });

  test('income 250,000 -> not eligible', () => {
    const profile = {
      gender: 'F',
      age: 25,
      rationCardHead: 'self',
      income: 250000,
      govtEmployeeInFamily: false,
      taxPayer: false,
      fourWheeler: false
    };
    const result = evaluateEligibilityExtended(profile, kmutRules);
    expect(result.verdict).toBe('near_miss'); // Exactly 1 mutable failure
    expect(result.failedCriteria.some(f => f.key === 'income')).toBe(true);
  });

  test('income missing -> possibly eligible', () => {
    const profile = {
      gender: 'F',
      age: 25,
      rationCardHead: 'self',
      govtEmployeeInFamily: false,
      taxPayer: false,
      fourWheeler: false
    };
    const result = evaluateEligibilityExtended(profile, kmutRules);
    expect(result.verdict).toBe('possibly_eligible');
    expect(result.unknownCriteria).toContain('income');
  });

  test('rationCardHead unknown -> possibly eligible / verify', () => {
    const profile = {
      gender: 'F',
      age: 25,
      income: 100000,
      govtEmployeeInFamily: false,
      taxPayer: false,
      fourWheeler: false
    };
    const result = evaluateEligibilityExtended(profile, kmutRules);
    expect(result.verdict).toBe('possibly_eligible');
    expect(result.unknownCriteria).toContain('rationCardHead');
  });

  test('male -> not eligible', () => {
    const profile = {
      gender: 'M',
      age: 25,
      rationCardHead: 'self',
      income: 100000,
      govtEmployeeInFamily: false,
      taxPayer: false,
      fourWheeler: false
    };
    const result = evaluateEligibilityExtended(profile, kmutRules);
    expect(result.verdict).toBe('not_eligible');
    expect(result.failedCriteria.some(f => f.key === 'gender')).toBe(true);
  });
});
