require('dotenv').config();
const { presentScheme } = require('../lib/presenter');
const Scheme = require('../models/Scheme');
const Fact = require('../models/Fact');
const mongoose = require('mongoose');

async function runDemo() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tn_schemes';
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('Connected to MongoDB.');
  } catch (e) {
    console.log('MongoDB connection skipped. Running with static starter definitions.');
  }

  console.log('================================================================================');
  console.log('DEMONSTRATION OF TWO-STAGE ARCHITECTURE (STAGE A ZERO AI, STAGE B PRESENTER)');
  console.log('================================================================================\n');

  // Load target schemes from DB or starter-schemes
  const targetNames = [
    'Old Age Pension (IGNOAPS / TN)',
    'CM Comprehensive Health Insurance (CMCHIS)',
    'State Government Employees Pension Scheme',
    'Unemployment Assistance Scheme'
  ];

  for (const name of targetNames) {
    let scheme = await Scheme.findOne({ name });
    if (!scheme) {
      scheme = {
        name,
        benefit: name.includes('CMCHIS') ? 'Cashless treatment cover of ₹5 lakh per family per year' :
                 name.includes('Old Age') ? '₹1,200/month for destitute elderly' :
                 name.includes('Unemployment') ? '₹1,000/month financial assistance for unemployed youth' :
                 'Pension amount for retired state government employees',
        rules: name.includes('Old Age') ? { age: { $gte: 60 }, destitute: true } :
               name.includes('CMCHIS') ? { income: { $lt: 120000 } } :
               name.includes('Unemployment') ? { age: { $gte: 18, $lte: 40 }, unemployed: true } :
               { age: { $gte: 58 }, retired: true },
        eligibilityRules: name.includes('Old Age') ? { age: { $gte: 60 }, destitute: true } : {},
        requiredDocuments: ['Aadhaar', 'Bank passbook', 'Income certificate'],
        howToApply: ['Apply at nearest e-Sevai centre with Aadhaar and passbook.', 'Officials verify your application in field verification.'],
        officialLinks: [['Official Portal', 'https://cra.tn.gov.in/eleg_schemes.php']],
        status: 'ACTIVE',
        verificationLevel: 'official'
      };
    }

    console.log(`>>> SCHEME: "${scheme.name}"`);

    // 1. DISPLAY_MODE=template (Algorithmic only)
    const algoDisplay = await presentScheme({
      scheme,
      lang: 'en',
      level: 'simple',
      mode: 'template'
    });
    console.log('\n[1] MODE=template (Algorithmic):');
    console.log(JSON.stringify({
      name: algoDisplay.name,
      benefit: algoDisplay.benefit,
      bullets: algoDisplay.bullets,
      summary: algoDisplay.summary,
      summaryLabel: algoDisplay.summaryLabel,
      explainedBy: algoDisplay.explainedBy,
      chips: algoDisplay.chips
    }, null, 2));

    // 2. DISPLAY_MODE=auto (AI enabled if available)
    const autoDisplay = await presentScheme({
      scheme,
      lang: 'en',
      level: 'simple',
      mode: 'auto'
    });
    console.log('\n[2] MODE=auto (AI with fallback):');
    console.log(JSON.stringify({
      name: autoDisplay.name,
      benefit: autoDisplay.benefit,
      summary: autoDisplay.summary,
      summaryLabel: autoDisplay.summaryLabel,
      explainedBy: autoDisplay.explainedBy,
      cached: autoDisplay.cached
    }, null, 2));

    // 3. Tamil version of Old Age Pension
    if (name.includes('Old Age')) {
      const taDisplay = await presentScheme({
        scheme: { ...scheme, nameTamil: 'முதியோர் ஓய்வூதியத் திட்டம்' },
        lang: 'ta',
        level: 'simple',
        mode: 'template'
      });
      console.log('\n[3] TAMIL VERSION (முதியோர் ஓய்வூதியத் திட்டம்):');
      console.log(JSON.stringify({
        name: taDisplay.name,
        benefit: taDisplay.benefit,
        bullets: taDisplay.bullets,
        summary: taDisplay.summary,
        summaryLabel: taDisplay.summaryLabel,
        chips: taDisplay.chips
      }, null, 2));
    }

    console.log('\n--------------------------------------------------------------------------------\n');
  }

  // 4. Test Tampered AI answer rejection
  console.log('>>> TESTING DELIBERATELY TAMPERED AI ANSWER REJECTION:');
  const { validateAiPresenterResponse } = require('../lib/presenter');
  const factsMap = {
    'fact_1': { field: 'amount', value: 1200, quote: 'Rs. 1,200 per month assistance' }
  };
  const tamperedAiAnswer = {
    sentences: [
      { text: 'Citizens will receive Rs. 25,00,000 directly to their account and approval is guaranteed.', factIds: ['fact_1'] }
    ],
    disclaimer: 'Explained with AI from official text. Confirm with the department.'
  };
  const validationResult = validateAiPresenterResponse(tamperedAiAnswer, factsMap);
  console.log('Tampered AI validation result:', validationResult);
  console.log('[DISPLAY ai rejected "Test Scheme" reason: ' + validationResult.reason + ' -> fallback algo]');

  // 5. Quota exhausted test
  console.log('\n>>> TESTING AI QUOTA EXHAUSTED STATE:');
  process.env.AI_MODE = 'off'; // Simulates unavailable AI
  const quotaDisplay = await presentScheme({
    scheme: {
      name: 'CM Comprehensive Health Insurance (CMCHIS)',
      benefit: 'Cashless treatment cover of ₹5 lakh per family per year',
      status: 'ACTIVE',
      rules: { income: { $lt: 120000 } }
    },
    mode: 'auto'
  });
  console.log(JSON.stringify({
    scheme: quotaDisplay.name,
    benefit: quotaDisplay.benefit,
    summary: quotaDisplay.summary,
    explainedBy: quotaDisplay.explainedBy,
    note: 'Standard summary shown with no error'
  }, null, 2));

  await mongoose.disconnect();
}

runDemo().catch(err => {
  console.error('Demo error:', err);
  process.exit(1);
});
