/**
 * Unit Tests for Advanced Fetching v3
 * Uses saved page fixtures ONLY (Zero Gemini calls, zero live network during unit tests)
 */

const { scoreLink, shouldCrawlLink } = require('../services/linkGraphCrawler');
const {
  normalizeSchemeName,
  areSchemesEquivalent,
  calculateConfirmationLevel,
  processPolicyNotes
} = require('../services/coverageService');
const { extractApplicationNotices } = require('../scrapers/fieldExtractors');
const CriteriaParser = require('../scrapers/CriteriaParser');
const { evaluateEligibilityExtended } = require('../services/ruleEngine');
const aiGate = require('../lib/aiGate');

describe('Advanced Fetching v3 Unit Tests (Saved Fixtures Only)', () => {

  describe('1. Link scoring and scope rules', () => {
    test('scores links containing scheme keywords highly', () => {
      const scoreScheme = scoreLink('https://tn.gov.in/schemes/scholarship-details', 'Adi Dravidar Scholarship');
      const scoreNormal = scoreLink('https://tn.gov.in/about-us', 'About Us');
      expect(scoreScheme).toBeGreaterThan(scoreNormal);
      expect(scoreScheme).toBeGreaterThanOrEqual(20);
    });

    test('strictly rejects login, register, and form submission links', () => {
      expect(shouldCrawlLink('https://tnuwwb.tn.gov.in/login')).toBe(false);
      expect(shouldCrawlLink('https://tnuwwb.tn.gov.in/register')).toBe(false);
      expect(shouldCrawlLink('https://scholarships.gov.in/apply-form')).toBe(false);
      expect(scoreLink('https://tnuwwb.tn.gov.in/auth/submit')).toBeLessThan(0);
    });

    test('rejects non-allowlisted domains', () => {
      expect(shouldCrawlLink('https://random-private-agent.com/pension')).toBe(false);
    });
  });

  describe('2. Notice and Application Status Detector', () => {
    test('detects "closed on" notice with date and quote', () => {
      const fixtureText = 'ADTW Portal Notice: Student applications closed on 31 Jul 2023 for fresh admissions.';
      const notices = extractApplicationNotices(fixtureText);
      expect(notices.length).toBeGreaterThan(0);
      expect(notices[0].status).toBe('closed');
      expect(notices[0].quote).toContain('applications closed on');
    });

    test('detects "last date" notice in English and Tamil', () => {
      const fixtureEn = 'Last date for submission of scholarship applications: 15/10/2026.';
      const noticesEn = extractApplicationNotices(fixtureEn);
      expect(noticesEn.length).toBeGreaterThan(0);
      expect(noticesEn[0].status).toBe('open');
      expect(noticesEn[0].type).toBe('deadline');
      expect(noticesEn[0].date).toBe('15/10/2026');

      const fixtureTa = 'விண்ணப்பிக்க கடைசி தேதி: 31/12/2026 வரை நீட்டிக்கப்பட்டுள்ளது.';
      const noticesTa = extractApplicationNotices(fixtureTa);
      expect(noticesTa.length).toBeGreaterThan(0);
      expect(noticesTa[0].status).toBe('open');
    });

    test('detects "applications invited" and upcoming renewal windows', () => {
      const fixture = 'Online applications are invited from eligible SC/ST students for post-matric scholarships.';
      const notices = extractApplicationNotices(fixture);
      expect(notices.length).toBeGreaterThan(0);
      expect(notices[0].status).toBe('open');
      expect(notices[0].type).toBe('open');
    });
  });

  describe('3. Department Index & Policy Note PDF Extraction', () => {
    test('extracts scheme names, benefits, and quotes with page numbers from Policy Note fixture', async () => {
      const samplePdfText = `
        TAMIL NADU GOVERNMENT
        ADI DRAVIDAR AND TRIBAL WELFARE DEPARTMENT
        POLICY NOTE 2024-2025
        Page 14
        Scheme: Post-Matric Scholarship Scheme for SC/ST students.
        The Government provides 100% financial assistance for tuition and special fees.
        [p. 25]
        Scheme: Free Housing and Financial Assistance for Tribal Families.
      `;

      const docs = [{
        department: 'Adi Dravidar Welfare',
        pdfUrl: 'https://tnadw.tn.gov.in/policy_note_2024.pdf',
        textContent: samplePdfText
      }];

      const pendingSchemes = await processPolicyNotes(docs);
      expect(pendingSchemes.length).toBe(2);
      expect(pendingSchemes[0].name).toContain('Post-Matric Scholarship');
      expect(pendingSchemes[0].quote).toContain('[p. 14]');
      expect(pendingSchemes[0].origin).toBe('policy_note');
      expect(pendingSchemes[0].reviewStatus).toBe('pending');
    });
  });

  describe('4. Scheme Entity Graph, Normalisation & Deduplication', () => {
    test('normalises names and identifies equivalent schemes by alias', () => {
      const s1 = { name: 'Old Age Pension (IGNOAPS / TN)', aliases: ['OAP', 'முதியோர் ஓய்வூதியம்'] };
      const s2 = { name: 'OAP Pension', aliases: [] };
      expect(areSchemesEquivalent(s1, s2)).toBe(true);

      const s3 = { name: 'Kalaignar Magalir Urimai Thogai', aliases: ['KMUT'] };
      const s4 = { name: 'Magalir Urimai Thogai', aliases: [] };
      expect(areSchemesEquivalent(s3, s4)).toBe(true);
    });

    test('calculates cross-source confirmation levels correctly', () => {
      const singleSource = ['https://cra.tn.gov.in/eleg_schemes.php'];
      expect(calculateConfirmationLevel(singleSource)).toBe('confirmed by 1 official source');

      const twoSources = [
        'https://cra.tn.gov.in/eleg_schemes.php',
        'https://karuvoolam.tn.gov.in/pension'
      ];
      expect(calculateConfirmationLevel(twoSources)).toBe('confirmed by 2 or more official sources');

      const noOfficial = ['https://unknown-blog.com/scheme'];
      expect(calculateConfirmationLevel(noOfficial)).toBe('unconfirmed');
    });
  });

  describe('5. Criteria Parser & Profile Matching for New Groups', () => {
    const parser = new CriteriaParser();

    test('parses community categories (SC/ST/BC/MBC/Minority)', () => {
      const text = 'Applicants must belong to Scheduled Caste (SC) or Scheduled Tribe (ST) communities.';
      const res = parser.parse(text);
      expect(res.rules.communityCategory).toBe('SC');
    });

    test('parses worker types and age ranges for welfare boards', () => {
      const text = 'Registered construction workers aged between 18 and 60 years are eligible for assistance.';
      const res = parser.parse(text);
      expect(res.rules.workerType).toBe('construction');
      expect(res.rules.ageRange).toEqual({ min: 18, max: 60 });
    });

    test('evaluates profile with missing answers as "possibly_eligible - verify"', () => {
      const schemeRules = {
        communityCategory: 'SC',
        income: { $lt: 250000 }
      };
      // Citizen profile has income but missing communityCategory
      const profile = { income: 150000 };
      const evalRes = evaluateEligibilityExtended(profile, schemeRules);
      expect(evalRes.verdict).toBe('possibly_eligible');
      expect(evalRes.unknownCriteria).toContain('communityCategory');
      expect(evalRes.questionsToAnswer[0]).toContain('community category');
    });
  });

  describe('6. Zero Gemini Calls Guard in Fetching', () => {
    test('AI Gate strictly refuses all background fetch calls with ai_disabled', async () => {
      const res = await aiGate.callGemini({
        purpose: 'background',
        execute: async () => ({ text: 'simulated' })
      });
      expect(res.ok).toBe(false);
      expect(res.code).toBe('ai_disabled');
    });
  });
});
