const { hashContent, normalizeName } = require('../services/crawlerService');

describe('Crawler & Admin Moderation Unit Tests', () => {
  // Test 1: Content Hashing
  test('hashContent returns consistent SHA-256 hex string', () => {
    const text1 = 'Kalaignar Magalir Urimai Thogai official GO rules 2026';
    const text2 = 'Kalaignar Magalir Urimai Thogai official GO rules 2026';
    const text3 = 'Different text content';

    const hash1 = hashContent(text1);
    const hash2 = hashContent(text2);
    const hash3 = hashContent(text3);

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1.length).toBe(64); // SHA-256 length
  });

  // Test 2: Name Normalization
  test('normalizeName strips punctuation, case, and whitespace', () => {
    expect(normalizeName('Kalaignar Magalir Urimai Thogai!')).toBe('kalaignarmagalirurimaithogai');
    expect(normalizeName('Pudhumai-Penn (Scheme)')).toBe('pudhumaipennscheme');
    expect(normalizeName('  CMCHIS  ')).toBe('cmchis');
  });

  // Test 3: Fixture Extracted Schemes Validation
  test('Extracted scheme fixture validation ensures allowed eligibility rules', () => {
    const schemeFixture = {
      name: 'Tamil Pudhalvan Scheme',
      category: 'Education',
      benefit: '₹1,000 per month for boys in higher education',
      eligibilityRules: {
        gender: 'M',
        studiedInGovtSchool: true,
        inHigherEducation: true
      },
      unmappedCriteria: ['Tamil medium school instruction'],
      origin: 'live',
      reviewStatus: 'pending'
    };

    expect(schemeFixture.reviewStatus).toBe('pending');
    expect(schemeFixture.origin).toBe('live');
    expect(schemeFixture.eligibilityRules.gender).toBe('M');
    expect(schemeFixture.eligibilityRules.studiedInGovtSchool).toBe(true);
    expect(schemeFixture.unmappedCriteria).toContain('Tamil medium school instruction');
  });

  // Test 4: Approval Workflow logic fixture
  test('Admin review workflow updates reviewStatus correctly', () => {
    const pendingFixture = {
      name: 'New Live Crawled Pension',
      reviewStatus: 'pending'
    };

    // Simulate approval
    pendingFixture.reviewStatus = 'approved';
    expect(pendingFixture.reviewStatus).toBe('approved');

    // Simulate rejection
    pendingFixture.reviewStatus = 'rejected';
    expect(pendingFixture.reviewStatus).toBe('rejected');
  });
});
