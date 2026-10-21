const {
  formatIndianNumber,
  renderBenefitLine,
  renderEligibilityBullets,
  cleanDocumentsAndSteps,
  extractiveSummarize,
  formatChangeMessage,
  calculateSchemeRankingScore,
  validateAiPresenterResponse,
  presentScheme,
  calculateFactsContentHash
} = require('../lib/presenter');
const { callGemini, resetGateForTesting } = require('../lib/aiGate');
const { isHostBlocked } = require('../lib/networkGuard');

describe('Stage B: Presenter & Algorithmic Display Layer Tests', () => {
  beforeEach(() => {
    resetGateForTesting();
  });

  describe('1. Number Formatting and Benefit Line', () => {
    test('formats Indian numbers correctly (commas, lakh, crore) in English and Tamil', () => {
      expect(formatIndianNumber(100000)).toBe('₹1 lakh');
      expect(formatIndianNumber(100000, true)).toBe('₹1 லட்சம்');

      expect(formatIndianNumber(2500000)).toBe('₹25 lakh');
      expect(formatIndianNumber(2500000, true)).toBe('₹25 லட்சம்');

      expect(formatIndianNumber(10000000)).toBe('₹1 crore');
      expect(formatIndianNumber(10000000, true)).toBe('₹1 கோடி');

      expect(formatIndianNumber(1200)).toBe('₹1,200');
      expect(formatIndianNumber(72000)).toBe('₹72,000');
    });

    test('renders deterministic benefit line with amount, frequency and mode', () => {
      const enLine = renderBenefitLine({
        amount: 1200,
        frequency: 'monthly',
        mode: 'bank',
        isTamil: false
      });
      expect(enLine).toBe('₹1,200 per month, paid to your bank account');

      const taLine = renderBenefitLine({
        amount: 1000,
        frequency: 'monthly',
        mode: 'bank',
        isTamil: true
      });
      expect(taLine).toBe('₹1,000 மாதந்தோறும், உங்கள் வங்கிக் கணக்கில் நேரடியாக செலுத்தப்படும்');
    });
  });

  describe('2. Eligibility Bullets and Unmapped Conditions', () => {
    test('renders bullet per rule type and quotes matching facts', () => {
      const rules = {
        age: { $gte: 60 },
        income: { $lt: 250000 },
        gender: 'F',
        marital: 'widowed',
        destitute: true,
        disability: { $gte: 40 },
        govschool: true
      };
      const facts = [
        { field: 'age', quote: 'Age 60 years and above' },
        { field: 'incomeLimit', quote: 'Family income below Rs. 2,50,000' }
      ];
      const unmapped = ['Must be a permanent resident of Tamil Nadu'];

      const resEn = renderEligibilityBullets({ rules, facts, unmapped, isTamil: false });
      expect(resEn.bullets).toEqual(expect.arrayContaining([
        expect.objectContaining({ text: 'Age 60 or above', quote: 'Age 60 years and above' }),
        expect.objectContaining({ text: 'Family income below ₹2.5 lakh a year' }),
        expect.objectContaining({ text: 'Women only' }),
        expect.objectContaining({ text: 'Destitute widow' }),
        expect.objectContaining({ text: 'Destitute person (no regular family income)' }),
        expect.objectContaining({ text: '40% or above disability' }),
        expect.objectContaining({ text: 'Studied in a government school from Classes 6 to 12' })
      ]));

      expect(resEn.alsoCheck).toEqual([
        { type: 'unmapped', text: 'Must be a permanent resident of Tamil Nadu', quote: null }
      ]);

      const resTa = renderEligibilityBullets({ rules: { age: { $gte: 60 } }, facts: [], unmapped: [], isTamil: true });
      expect(resTa.bullets[0].text).toBe('60 வயது அல்லது அதற்கு மேல்');
    });
  });

  describe('3. Documents and Steps Cleaning', () => {
    test('cleans, deduplicates, and shortens very long step lines at sentence boundaries', () => {
      const docs = ['Aadhaar', '  Aadhaar ', 'Ration card'];
      const steps = [
        'Apply online at e-Sevai portal.',
        'This is a very long instruction line that explains all the details of submitting documents to the taluk office in person or via the portal. Make sure you bring original copies along with three passport size photos and proof of income from the village administrative officer.'
      ];

      const cleaned = cleanDocumentsAndSteps(docs, steps);
      expect(cleaned.documents).toEqual(['Aadhaar', 'Ration card']);
      expect(cleaned.steps[0]).toBe('Apply online at e-Sevai portal.');
      expect(cleaned.steps[1].length).toBeLessThan(steps[1].length);
    });
  });

  describe('4. Extractive Summarisation', () => {
    test('picks best sentences in deterministic, original order without inventing words', () => {
      const sampleText = `
        The Tamil Nadu government implemented this welfare program.
        Eligible elderly citizens get a pension assistance of Rs. 1,200 per month.
        The applicant must have an annual income limit below Rs. 1,00,000.
        Applications can be submitted through the nearest e-Sevai centre.
        This initiative was announced in the state legislative assembly.
      `;

      const res = extractiveSummarize(sampleText, 'Old Age Pension', false);
      expect(res.label).toBe('Summary from the official text');
      expect(res.summary).toContain('Rs. 1,200 per month');
      expect(res.summary).toContain('annual income limit below Rs. 1,00,000');
    });
  });

  describe('5. Change Messages Formatting', () => {
    test('formats change history messages into standard notification text', () => {
      const msg = formatChangeMessage({
        field: 'benefit',
        oldValue: '₹5 lakh',
        newValue: '₹25 lakh',
        source: 'https://cmchistn.com/scheme',
        date: new Date('2026-08-19')
      }, 'CMCHIS');

      expect(msg).toContain('CMCHIS: cover/benefit changed from ₹5 lakh to ₹25 lakh');
      expect(msg).toContain('source: cmchistn.com');
    });
  });

  describe('6. Ordering and Ranking Algorithm', () => {
    test('ranks schemes with transparent scoring and returns why this order', () => {
      const schemeEligible = {
        name: 'Eligible Scheme',
        benefit: '₹1,500/month',
        changedRecently: true,
        verificationLevel: 'official'
      };
      const ranking = calculateSchemeRankingScore(schemeEligible, 'eligible');
      expect(ranking.score).toBeGreaterThan(1000);
      expect(ranking.why).toContain('Eligible for citizen profile (+1000)');
      expect(ranking.why).toContain('Officially confirmed source (+100)');
    });
  });

  describe('7. AI Presenter Validator', () => {
    const validCitedFacts = {
      'fact_1': { field: 'amount', value: 1200, quote: 'pension of Rs. 1,200 per month' },
      'fact_2': { field: 'age', value: 60, quote: 'Age 60 years and above' }
    };

    test('accepts faithful paraphrase with mandatory disclaimer and cited fact ids', () => {
      const aiResponse = {
        sentences: [
          { text: 'Citizens aged 60 and above receive 1200 per month.', factIds: ['fact_1', 'fact_2'] }
        ],
        disclaimer: 'Explained with AI from official text. Confirm with the department.'
      };
      const val = validateAiPresenterResponse(aiResponse, validCitedFacts);
      expect(val.valid).toBe(true);
    });

    test('rejects changed numbers or new numbers not present in facts', () => {
      const aiResponse = {
        sentences: [
          { text: 'Citizens receive 2500 per month.', factIds: ['fact_1'] }
        ],
        disclaimer: 'Explained with AI from official text. Confirm with the department.'
      };
      const val = validateAiPresenterResponse(aiResponse, validCitedFacts);
      expect(val.valid).toBe(false);
      expect(val.reason).toContain('Number 2500 not present in cited facts');
    });

    test('rejects non-existent or invented fact IDs', () => {
      const aiResponse = {
        sentences: [
          { text: 'Citizens aged 60 receive assistance.', factIds: ['fact_999'] }
        ],
        disclaimer: 'Explained with AI from official text. Confirm with the department.'
      };
      const val = validateAiPresenterResponse(aiResponse, validCitedFacts);
      expect(val.valid).toBe(false);
      expect(val.reason).toContain('Invented or non-existent fact id cited');
    });

    test('rejects approval promises ("you will get")', () => {
      const aiResponse = {
        sentences: [
          { text: 'You will get 1200 per month automatically.', factIds: ['fact_1'] }
        ],
        disclaimer: 'Explained with AI from official text. Confirm with the department.'
      };
      const val = validateAiPresenterResponse(aiResponse, validCitedFacts);
      expect(val.valid).toBe(false);
      expect(val.reason).toContain('Forbidden approval claim');
    });

    test('rejects missing department disclaimer', () => {
      const aiResponse = {
        sentences: [
          { text: 'Citizens aged 60 receive 1200 per month.', factIds: ['fact_1', 'fact_2'] }
        ],
        disclaimer: 'General summary.'
      };
      const val = validateAiPresenterResponse(aiResponse, validCitedFacts);
      expect(val.valid).toBe(false);
      expect(val.reason).toContain('Missing mandatory disclaimer');
    });
  });

  describe('8. AI Gate Restrictions', () => {
    test('AI Gate permits only "display" and "user" purposes', async () => {
      const spy = jest.fn().mockResolvedValue({ text: 'ok' });

      // Purpose background should be refused
      const bgRes = await callGemini({ purpose: 'background', execute: spy });
      expect(bgRes.ok).toBe(false);
      expect(bgRes.code).toBe('ai_disabled');

      // Random purpose should be refused
      const crawlerRes = await callGemini({ purpose: 'crawling', execute: spy });
      expect(crawlerRes.ok).toBe(false);
      expect(crawlerRes.code).toBe('ai_disabled');
    });
  });
});
