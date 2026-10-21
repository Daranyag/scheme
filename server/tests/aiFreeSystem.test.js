const fs = require('fs');
const path = require('path');
const { splitSections, classifySentence } = require('../scrapers/sectionSplitter');
const { calculateCompleteness, mergeWithOfficialFacts } = require('../lib/completeness');
const { presentScheme, buildCompareView } = require('../lib/presenter');
const { loadRecipe, saveRecipe, testRecipeAgainstFixture } = require('../lib/recipes');
const { answerRuleBasedChat, detectIntent, detectLanguage } = require('../lib/ruleChatAssistant');
const { parseMySchemePayload } = require('../scrapers/MySchemeAdapter');
const { installNetworkGuard } = require('../lib/networkGuard');

describe('1. Static AI Import Audit Across Core Fetch/Scrape/Display Modules', () => {
  const FORBIDDEN_AI_PACKAGES = [
    '@google/genai',
    '@google/generative-ai',
    'openai',
    'anthropic',
    '@anthropic-ai/sdk'
  ];

  function checkDir(dirPath) {
    const files = fs.readdirSync(dirPath);
    const violations = [];

    for (const f of files) {
      const fullPath = path.join(dirPath, f);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        violations.push(...checkDir(fullPath));
      } else if (f.endsWith('.js')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const pkg of FORBIDDEN_AI_PACKAGES) {
          const regex = new RegExp(`require\\(['"\`]${pkg}['"\`]|from\\s+['"\`]${pkg}['"\`]`, 'i');
          if (regex.test(content)) {
            violations.push(`${fullPath} imports ${pkg}`);
          }
        }
      }
    }
    return violations;
  }

  test('no AI SDK imports in server/scrapers', () => {
    const violations = checkDir(path.join(__dirname, '../scrapers'));
    expect(violations).toEqual([]);
  });

  test('no AI SDK imports in server/lib/presenter.js and completeness.js', () => {
    const files = [
      path.join(__dirname, '../lib/presenter.js'),
      path.join(__dirname, '../lib/completeness.js'),
      path.join(__dirname, '../lib/recipes.js'),
      path.join(__dirname, '../lib/normalizer.js')
    ];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pkg of FORBIDDEN_AI_PACKAGES) {
        const regex = new RegExp(`require\\(['"\`]${pkg}['"\`]|from\\s+['"\`]${pkg}['"\`]`, 'i');
        expect(regex.test(content)).toBe(false);
      }
    }
  });

  test('no AI SDK imports in crawlerService, verifier, searchService, verificationJob', () => {
    const services = [
      path.join(__dirname, '../services/crawlerService.js'),
      path.join(__dirname, '../services/verifier.js'),
      path.join(__dirname, '../services/searchService.js'),
      path.join(__dirname, '../services/verificationJob.js'),
      path.join(__dirname, '../services/discoveryService.js')
    ];
    for (const file of services) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        for (const pkg of FORBIDDEN_AI_PACKAGES) {
          const regex = new RegExp(`require\\(['"\`]${pkg}['"\`]|from\\s+['"\`]${pkg}['"\`]`, 'i');
          expect(regex.test(content)).toBe(false);
        }
      }
    }
  });
});

describe('2. Network Guard Enforcement', () => {
  beforeAll(() => {
    installNetworkGuard();
  });

  test('blocks outbound requests to Gemini endpoints with BLOCKED AI CALL message', async () => {
    process.env.AI_MODE = 'off';
    const https = require('https');

    let consoleLogs = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = (...args) => consoleLogs.push(args.join(' '));
    console.error = (...args) => consoleLogs.push(args.join(' '));

    try {
      let blockedError = null;
      try {
        await new Promise((resolve, reject) => {
          const req = https.request('https://generativelanguage.googleapis.com/v1beta/models', (res) => {
            reject(new Error('Should have been blocked'));
          });
          req.on('error', (err) => resolve(err));
          req.end();
        });
      } catch (err) {
        blockedError = err;
      }

      const blockedLog = consoleLogs.find(l => l.includes('BLOCKED AI CALL at'));
      expect(blockedLog || (blockedError && blockedError.message.includes('BLOCKED AI CALL'))).toBeTruthy();
    } finally {
      console.log = origLog;
      console.error = origErr;
    }
  });
});

describe('3. Section Splitter & Sentence Classifier (English & Tamil)', () => {
  test('splits HTML into semantic sections with heading, category, sentences', () => {
    const html = `
      <h1>Pudhumai Penn Scheme</h1>
      <p>Financial assistance of ₹1,000 per month will be transferred to eligible girl students.</p>
      <h2>Eligibility Criteria</h2>
      <ul>
        <li>Girl students who studied in government schools from classes 6 to 12.</li>
        <li>Must be enrolled in recognized undergraduate courses.</li>
      </ul>
      <h2>Required Documents</h2>
      <p>Aadhaar card, 10th and 12th mark sheets, and bank passbook.</p>
    `;

    const sections = splitSections(html, 'https://tnsocialwelfare.tn.gov.in');
    expect(sections.length).toBeGreaterThanOrEqual(2);

    const categories = sections.map(s => s.category);
    expect(categories).toContain('eligibility');
    expect(categories).toContain('documents');
  });

  test('classifies English sentences into categories', () => {
    expect(classifySentence('Assistance of ₹1,000 per month is given').category).toBe('benefit');
    expect(classifySentence('The applicant age must be 60 years and above').category).toBe('eligibility');
    expect(classifySentence('Submit your ration card and aadhaar copy').category).toBe('documents');
    expect(classifySentence('Apply through your nearest e-Sevai centre').category).toBe('apply');
  });

  test('classifies Tamil sentences into categories', () => {
    expect(classifySentence('மாதந்தோறும் ரூ.1,200 உதவித்தொகை வழங்கப்படும்').category).toBe('benefit');
    expect(classifySentence('விண்ணப்பதாரர் 60 வயது பூர்த்தியடைந்தவராக இருக்க வேண்டும்').category).toBe('eligibility');
    expect(classifySentence('குடும்ப அட்டை மற்றும் ஆதார் அட்டை இணைக்க வேண்டும்').category).toBe('documents');
    expect(classifySentence('இ-சேவை மையம் மூலம் விண்ணப்பிக்கலாம்').category).toBe('apply');
  });
});

describe('4. Completeness Scorer & Official Merge Rules', () => {
  test('calculates score 100% when all key fields are present', () => {
    const scheme = {
      name: 'Test Full Scheme',
      benefit: '₹1,000 per month',
      status: 'ACTIVE',
      rules: { age: { $gte: 60 } },
      docs: ['Aadhaar', 'Ration Card'],
      steps: ['Apply online'],
      sourceUrl: 'https://cra.tn.gov.in'
    };
    const facts = [
      { field: 'amount', value: 1000, quote: '₹1,000 per month' },
      { field: 'age', value: { $gte: 60 }, quote: 'Age 60+' }
    ];

    const result = calculateCompleteness(scheme, facts);
    expect(result.score).toBe(100);
    expect(result.missingFields).toEqual([]);
  });

  test('identifies missing fields when benefit or criteria are missing', () => {
    const scheme = {
      name: 'Partial Scheme',
      benefit: '',
      rules: {},
      docs: [],
      steps: []
    };
    const result = calculateCompleteness(scheme, []);
    expect(result.score).toBeLessThan(50);
    expect(result.missingFields).toContain('benefit amount');
    expect(result.missingFields).toContain('eligibility');
  });

  test('mergeWithOfficialFacts: official facts override starter facts with quotes', () => {
    const starterScheme = {
      name: 'Old Age Pension',
      benefit: '₹1,000 per month',
      rules: { age: { $gte: 65 } },
      docs: ['Old Ration Card']
    };

    const officialFacts = [
      { field: 'amount', value: 1200, quote: '₹1,200 per month as per GO' },
      { field: 'age', value: { $gte: 60 }, quote: 'Age 60 years and above' }
    ];

    const merged = mergeWithOfficialFacts(starterScheme, officialFacts);
    expect(merged.benefit).toBe('₹1,200/month');
    expect(merged.rules.age).toEqual({ $gte: 60 });
    expect(merged.starterData.benefit).toBe('₹1,000 per month');
  });
});

describe('5. Five Display States and Compare View', () => {
  test('buildCompareView returns differences between starter and official facts', () => {
    const scheme = {
      name: 'CMCHIS',
      benefit: '₹5,00,000 per family per year',
      starterData: {
        benefit: '₹1,00,000 per family'
      }
    };
    const facts = [
      { field: 'amount', value: 500000, quote: 'Cashless cover up to ₹5,00,000 per family' }
    ];

    const compare = buildCompareView(scheme, facts);
    expect(compare).toBeTruthy();
    expect(compare.hasDifferences).toBe(true);
    expect(compare.differences.some(d => d.field === 'benefit')).toBe(true);
  });
});

describe('6. Recipe Management Infrastructure', () => {
  test('loads existing recipe from server/recipes/', () => {
    const recipe = loadRecipe('cra_pensions');
    expect(recipe).toBeTruthy();
    expect(recipe.source).toBe('cra_pensions');
    expect(recipe.fields).toBeTruthy();
  });

  test('tests recipe against fixture and reports extracted facts', async () => {
    const fixtureHtml = fs.readFileSync(path.join(__dirname, 'fixtures/about_schemes_t.php'), 'utf8');
    const result = await testRecipeAgainstFixture('cra_pensions', fixtureHtml);
    expect(result.ok).toBe(true);
    expect(result.factsCount).toBeGreaterThan(0);
    expect(result.completenessScore).toBeGreaterThan(0);
  });
});

describe('7. Deterministic Rule-Based Chat Assistant', () => {
  test('detects all 9 required intents across English, Tamil, and Tanglish', () => {
    expect(detectIntent('What is the benefit amount?')).toBe('amount');
    expect(detectIntent('உதவித்தொகை எவ்வளவு?')).toBe('amount');
    expect(detectIntent('kmut amount evalavu?')).toBe('amount');

    expect(detectIntent('Who is eligible for this scheme?')).toBe('eligibility');
    expect(detectIntent('யார் விண்ணப்பிக்கலாம்?')).toBe('eligibility');
    expect(detectIntent('apply panna thaguthi enna?')).toBe('eligibility');

    expect(detectIntent('What documents are required?')).toBe('documents');
    expect(detectIntent('தேவையான ஆவணங்கள் என்ன?')).toBe('documents');
    expect(detectIntent('documents enna venum?')).toBe('documents');

    expect(detectIntent('How to apply online?')).toBe('how_to_apply');
    expect(detectIntent('எப்படி விண்ணப்பிப்பது?')).toBe('how_to_apply');
    expect(detectIntent('eppadi apply pandrathu?')).toBe('how_to_apply');

    expect(detectIntent('Where is the official link?')).toBe('official_link');
    expect(detectIntent('அதிகாரப்பூர்வ வலைத்தளம் என்ன?')).toBe('official_link');
    expect(detectIntent('portal link enna?')).toBe('official_link');

    expect(detectIntent('What is the application status?')).toBe('status');
    expect(detectIntent('விண்ணப்ப நிலை என்ன?')).toBe('status');
    expect(detectIntent('status enna?')).toBe('status');

    expect(detectIntent('When is the last date?')).toBe('deadline');
    expect(detectIntent('கடைசி தேதி எப்போது?')).toBe('deadline');
    expect(detectIntent('last date eppo?')).toBe('deadline');

    expect(detectIntent('What changed recently?')).toBe('what_changed');
    expect(detectIntent('என்ன மாற்றங்கள் செய்யப்பட்டுள்ளன?')).toBe('what_changed');
    expect(detectIntent('changes enna aachu?')).toBe('what_changed');

    expect(detectIntent('Compare OAP vs Destitute Widow Pension')).toBe('compare');
    expect(detectIntent('இரண்டு திட்டங்களுக்கும் உள்ள வித்தியாசம் என்ன?')).toBe('compare');
    expect(detectIntent('rendu kum enna vidhyasam compare pannu')).toBe('compare');
  });

  test('answers amount query accurately with quote without calling AI', async () => {
    const res = await answerRuleBasedChat({
      message: 'What is the amount for Pudhumai Penn?',
      profile: {},
      lang: 'en'
    });
    expect(res.answer).toContain('Pudhumai Penn');
    expect(res.answer).toContain('₹1,000');
    expect(res.intent).toBe('amount');
  });

  test('answers eligibility query and evaluates profile using rule engine', async () => {
    const res = await answerRuleBasedChat({
      message: 'Am I eligible for Old Age Pension?',
      profile: { age: 65, destitute: true },
      lang: 'en'
    });
    expect(res.answer).toContain('Old Age Pension');
    expect(res.answer).toMatch(/eligible/i);
    expect(res.intent).toBe('eligibility');
  });
});

describe('8. CMCHIS MySchemeAdapter Golden Extraction', () => {
  test('extracts ₹5,00,000, income limit ₹1,20,000, residency, documents from fixture', () => {
    const fixtureJson = fs.readFileSync(path.join(__dirname, 'fixtures/myscheme_cmchis.json'), 'utf8');
    const result = parseMySchemePayload(fixtureJson);

    expect(result.success).toBe(true);
    expect(result.amount).toBe(500000);
    expect(result.incomeLimit).toBe(120000);
    expect(result.residency).toBe('Tamil Nadu');
    expect(result.familyCoverage).toBe(true);

    const amountFact = result.facts.find(f => f.field === 'amount');
    expect(amountFact).toBeTruthy();
    expect(amountFact.quote).toContain('5,00,000');

    const incomeFact = result.facts.find(f => f.field === 'income');
    expect(incomeFact).toBeTruthy();
    expect(incomeFact.quote).toContain('1,20,000');
  });
});
