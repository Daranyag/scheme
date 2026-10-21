const Scheme = require('../models/Scheme');
const { presentScheme } = require('./presenter');
const { evaluateEligibilityExtended } = require('../services/ruleEngine');
const starterSchemes = require('../data/starter-schemes.json');

// Intent recognition regexes covering English, Tamil, and Tanglish
const INTENT_PATTERNS = {
  compare: [
    /compare/i, /vs\b/i, /versus/i, /difference between/i, /ஒப்பீடு/, /வித்தியாசம்/, /வேறுபாடு/,
    /rendu kum enna vidhyasam/i, /difference enna/i, /compare pannu/i
  ],
  eligibility: [
    /eligib/i, /who can apply/i, /age limit/i, /qualification/i, /criteria/i, /condition/i, /income limit/i,
    /தகுதி/, /யார் விண்ணப்பிக்கலாம்/, /வயது/, /வருமானம்/, /நிபந்தனை/,
    /thaguthi/i, /thagudi/i, /yaaru apply/i, /apply pannalam/i, /varumaanam/i
  ],
  documents: [
    /document/i, /docs\b/i, /certificate/i, /papers/i, /ration card/i, /aadhaar/i, /proof/i,
    /ஆவணங்கள்/, /சான்றிதழ்/, /என்ன வேண்டும்/, /சான்றுகள்/, /குடும்ப அட்டை/,
    /aavanangal/i, /documents enna/i, /enna venum/i, /certificate enna/i, /proof enna/i
  ],
  how_to_apply: [
    /how to apply/i, /procedure/i, /where to apply/i, /steps\b/i, /process\b/i, /register/i, /e-sevai/i, /apply/i,
    /எப்படி விண்ணப்பிப்பது/, /விண்ணப்பிக்கும் முறை/, /எங்கே விண்ணப்பிக்க/, /பதிவு/,
    /eppadi apply/i, /apply pandrathu/i, /apply panradhu/i, /enga apply/i, /apply procedure/i
  ],
  official_link: [
    /official link/i, /link\b/i, /portal\b/i, /website/i, /url\b/i, /online link/i,
    /இணையதளம்/, /இணைப்பு/, /வலைத்தளம்/, /போர்டல்/,
    /link enna/i, /website enna/i, /portal link/i
  ],
  status: [
    /status\b/i, /application status/i, /track\b/i, /is it open/i, /active\b/i,
    /நிலை/, /விண்ணப்ப நிலை/, /திறக்கப்பட்டுள்ளதா/,
    /status enna/i, /open-a/i, /track pandrathu/i
  ],
  deadline: [
    /deadline/i, /last date/i, /end date/i, /closing date/i, /due date/i,
    /கடைசி தேதி/, /இறுதி நாள்/, /முடிவு தேதி/,
    /last date eppo/i, /kadaisi thethi/i, /deadline eppo/i
  ],
  what_changed: [
    /what changed/i, /history/i, /updates\b/i, /recent changes/i, /difference/i, /new rules/i,
    /என்ன மாறியது/, /மாற்றங்கள்/, /புதிய விதிகள்/,
    /enna maaruchu/i, /changes enna/i, /update enna/i
  ],
  amount: [
    /amount/i, /how much/i, /benefit/i, /money/i, /grant/i, /pension amount/i, /rupees/i, /rs\b/i, /sum\b/i,
    /தொகை/, /எவ்வளவு/, /பணம்/, /உதவித்தொகை/, /மானிய(ம்|கள்)/, /நிதி/,
    /thogai/i, /evalavu/i, /evvalavu/i, /panam/i, /kasu/i, /evlo/i
  ],
  how_to_apply: [
    /how to apply/i, /procedure/i, /where to apply/i, /steps\b/i, /process\b/i, /register/i, /e-sevai/i, /apply/i,
    /எப்படி விண்ணப்பிப்பது/, /விண்ணப்பிக்கும் முறை/, /எங்கே விண்ணப்பிக்க/, /பதிவு/,
    /eppadi apply/i, /apply pandrathu/i, /apply panradhu/i, /enga apply/i, /apply procedure/i
  ],
  official_link: [
    /official link/i, /link\b/i, /portal\b/i, /website/i, /url\b/i, /online link/i,
    /இணையதளம்/, /இணைப்பு/, /வலைத்தளம்/, /போர்டல்/,
    /link enna/i, /website enna/i, /portal link/i
  ],
  status: [
    /status\b/i, /application status/i, /track\b/i, /is it open/i, /active\b/i,
    /நிலை/, /விண்ணப்ப நிலை/, /திறக்கப்பட்டுள்ளதா/,
    /status enna/i, /open-a/i, /track pandrathu/i
  ],
  deadline: [
    /deadline/i, /last date/i, /end date/i, /closing date/i, /due date/i,
    /கடைசி தேதி/, /இறுதி நாள்/, /முடிவு தேதி/,
    /last date eppo/i, /kadaisi thethi/i, /deadline eppo/i
  ],
  what_changed: [
    /what changed/i, /history/i, /updates\b/i, /recent changes/i, /difference/i, /new rules/i,
    /என்ன மாறியது/, /மாற்றங்கள்/, /புதிய விதிகள்/,
    /enna maaruchu/i, /changes enna/i, /update enna/i
  ]
};

function detectIntent(text) {
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (patterns.some(p => p.test(text))) {
      return intent;
    }
  }
  return 'general';
}

function detectLanguage(text) {
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';
  return 'en';
}

/**
 * Searches and scores schemes by name/alias match in user query
 */
async function findSchemesInQuery(queryText, explicitNames = []) {
  const normQuery = (queryText || '').toLowerCase();
  let dbSchemes = [];
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      dbSchemes = await Scheme.find().lean();
    }
  } catch (e) {}

  const allSchemes = dbSchemes.length > 0 ? dbSchemes : starterSchemes;
  const matched = [];

  for (const s of allSchemes) {
    const name = (s.name || '').toLowerCase();
    const nameTa = (s.nameTamil || '').toLowerCase();
    const aliases = (s.aliases || []).map(a => a.toLowerCase());

    // Direct check
    let hit = false;
    if (explicitNames.includes(s.name)) {
      hit = true;
    } else if (normQuery.includes(name) || (nameTa && normQuery.includes(nameTa))) {
      hit = true;
    } else if (aliases.some(a => a.length > 2 && normQuery.includes(a))) {
      hit = true;
    } else {
      // Substring key terms check
      const terms = [
        { term: 'pudhumai penn', scheme: 'Pudhumai Penn' },
        { term: 'moovalur', scheme: 'Pudhumai Penn' },
        { term: 'magalir urimai', scheme: 'Kalaignar Magalir Urimai Thogai' },
        { term: 'kmut', scheme: 'Kalaignar Magalir Urimai Thogai' },
        { term: 'old age pension', scheme: 'Old Age Pension (IGNOAPS / TN)' },
        { term: 'oap', scheme: 'Old Age Pension (IGNOAPS / TN)' },
        { term: 'widow', scheme: 'Destitute Widow Pension' },
        { term: 'deserted', scheme: 'Destitute / Deserted Wives Pension' },
        { term: 'unmarried', scheme: 'Unmarried Poor Women Pension' },
        { term: 'differently abled', scheme: 'Differently Abled Pension (DAPS)' },
        { term: 'handicap', scheme: 'Differently Abled Pension (DAPS)' },
        { term: 'cmchis', scheme: 'CM Comprehensive Health Insurance (CMCHIS)' },
        { term: 'health insurance', scheme: 'CM Comprehensive Health Insurance (CMCHIS)' },
        { term: 'maruthuva kapidu', scheme: 'CM Comprehensive Health Insurance (CMCHIS)' },
        { term: 'vidiyal', scheme: 'Vidiyal Payanam (Free Bus Travel)' },
        { term: 'free bus', scheme: 'Vidiyal Payanam (Free Bus Travel)' },
        { term: 'naan mudhalvan', scheme: 'Naan Mudhalvan' },
        { term: 'tamil pudhalvan', scheme: 'Tamil Pudhalvan' },
        { term: 'muthulakshmi', scheme: 'Dr. Muthulakshmi Reddy Maternity Benefit Scheme' },
        { term: 'maternity', scheme: 'Dr. Muthulakshmi Reddy Maternity Benefit Scheme' },
        { term: 'pregnant', scheme: 'Dr. Muthulakshmi Reddy Maternity Benefit Scheme' },
        { term: 'pregnancy', scheme: 'Dr. Muthulakshmi Reddy Maternity Benefit Scheme' },
        { term: 'கர்ப்பிணி', scheme: 'Dr. Muthulakshmi Reddy Maternity Benefit Scheme' },
        { term: 'பிரசவ', scheme: 'Dr. Muthulakshmi Reddy Maternity Benefit Scheme' },
        { term: 'மகப்பேறு', scheme: 'Dr. Muthulakshmi Reddy Maternity Benefit Scheme' },
        { term: 'thaimaaman', scheme: 'Thaimaaman Seer Thittam (Newborn Gold Ring Scheme)' },
        { term: 'gold ring', scheme: 'Thaimaaman Seer Thittam (Newborn Gold Ring Scheme)' },
        { term: 'தாய்மாமன்', scheme: 'Thaimaaman Seer Thittam (Newborn Gold Ring Scheme)' },
        { term: 'தங்க மோதிரம்', scheme: 'Thaimaaman Seer Thittam (Newborn Gold Ring Scheme)' },
        { term: 'newborn', scheme: 'Thaimaaman Seer Thittam (Newborn Gold Ring Scheme)' },
        { term: 'child', scheme: 'Thaimaaman Seer Thittam (Newborn Gold Ring Scheme)' },
        { term: 'குழந்தை', scheme: 'Thaimaaman Seer Thittam (Newborn Gold Ring Scheme)' }
      ];
      for (const t of terms) {
        if (normQuery.includes(t.term) && s.name.toLowerCase().includes(t.scheme.toLowerCase())) {
          hit = true;
          break;
        }
      }
    }

    if (hit) {
      matched.push(s);
    }
  }

  return matched;
}

/**
 * Builds deterministic rule-based answer
 */
async function answerRuleBasedChat({ message, messages = [], profile = {}, eligibleSchemes = [], lang = null }) {
  const lastUserMsg = message || (messages.filter(m => m.role === 'user').pop()?.text || '');
  const detectedLang = lang || detectLanguage(lastUserMsg);
  const isTa = detectedLang === 'ta';
  const intent = detectIntent(lastUserMsg);

  // Find schemes mentioned or use eligibleSchemes
  let schemes = await findSchemesInQuery(lastUserMsg, eligibleSchemes);
  if (schemes.length === 0 && eligibleSchemes && eligibleSchemes.length > 0) {
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState === 1) {
        schemes = await Scheme.find({ name: { $in: eligibleSchemes } }).lean();
      }
    } catch (e) {}
    if (schemes.length === 0) {
      schemes = starterSchemes.filter(s => eligibleSchemes.includes(s.name));
    }
  }

  // If still no scheme matched, pick top relevant starter schemes
  if (schemes.length === 0) {
    schemes = [starterSchemes[0]]; // Kalaignar Magalir Urimai Thogai
  }

  const primaryScheme = schemes[0];
  const presented = await presentScheme({ scheme: primaryScheme, lang: detectedLang, mode: 'template' });

  let answerText = '';

  if (intent === 'compare' && schemes.length >= 2) {
    const s1 = schemes[0];
    const s2 = schemes[1];
    const p1 = await presentScheme({ scheme: s1, lang: detectedLang, mode: 'template' });
    const p2 = await presentScheme({ scheme: s2, lang: detectedLang, mode: 'template' });

    answerText = isTa
      ? `### திட்ட ஒப்பீடு:\n\n` +
        `**1. ${p1.name}**\n` +
        `- பயன் (Benefit): ${p1.benefit}\n` +
        `- தகுதி நிபந்தனைகள்: ${p1.bullets.slice(0, 3).join('; ')}\n` +
        `- இணையதளம்: ${s1.sourceUrl || 'tn.gov.in'}\n\n` +
        `**2. ${p2.name}**\n` +
        `- பயன் (Benefit): ${p2.benefit}\n` +
        `- தகுதி நிபந்தனைகள்: ${p2.bullets.slice(0, 3).join('; ')}\n` +
        `- இணையதளம்: ${s2.sourceUrl || 'tn.gov.in'}\n\n` +
        `*(குறிப்பு: அரசு அதிகாரப்பூர்வ தரவுகளின் நேரடி ஒப்பீடு)*`
      : `### Scheme Comparison:\n\n` +
        `**1. ${p1.name}**\n` +
        `- Benefit: ${p1.benefit}\n` +
        `- Eligibility: ${p1.bullets.slice(0, 3).join('; ')}\n` +
        `- Portal: ${s1.sourceUrl || 'tn.gov.in'}\n\n` +
        `**2. ${p2.name}**\n` +
        `- Benefit: ${p2.benefit}\n` +
        `- Eligibility: ${p2.bullets.slice(0, 3).join('; ')}\n` +
        `- Portal: ${s2.sourceUrl || 'tn.gov.in'}\n\n` +
        `*(Note: Rule-based comparison generated from official verified facts)*`;

  } else if (intent === 'amount') {
    const freq = presented.chips.find(c => c.label === (isTa ? 'அதிர்வெண்' : 'Frequency'))?.value || 'Monthly';
    answerText = isTa
      ? `**${presented.name}** திட்டத்தின் உதவித்தொகை:\n\n` +
        `• தொகை: **${presented.benefit}**\n` +
        `• வழங்கும் முறை: ${freq}\n` +
        `• சரிபார்ப்பு நிலை: ${presented.chips.find(c => c.label === 'சரிபார்ப்பு')?.value || 'அதிகாரப்பூர்வ தகவல்'}\n\n` +
        `விண்ணப்பிக்க அருகிலுள்ள இ-சேவை மையம் அல்லது அதிகாரப்பூர்வ போர்ட்டலை அணுகவும்.`
      : `**${presented.name}** - Benefit Details:\n\n` +
        `• Benefit Amount: **${presented.benefit}**\n` +
        `• Frequency: ${freq}\n` +
        `• Status: ${presented.chips.find(c => c.label === 'Verified')?.value || 'Official source confirmed'}\n\n` +
        `You can apply via your nearest e-Sevai centre or the official portal.`;

  } else if (intent === 'eligibility') {
    let evalNote = '';
    if (profile && Object.keys(profile).length > 0) {
      const evalRes = evaluateEligibilityExtended(profile, primaryScheme.rules || primaryScheme.eligibilityRules || {}, primaryScheme.status);
      if (evalRes.verdict === 'eligible') {
        evalNote = isTa ? `\n✅ **உங்கள் விவரப்படி நீங்கள் இத்திட்டத்திற்கு தகுதியானவர்.**\n` : `\n✅ **Based on your profile, you are eligible for this scheme.**\n`;
      } else if (evalRes.verdict === 'not_eligible') {
        const failedKeys = evalRes.failedCriteria.map(f => f.key).join(', ');
        evalNote = isTa ? `\n⚠️ **தகுதி பெறாத நிபந்தனைகள்: ${failedKeys}**\n` : `\n⚠️ **Unmet criteria: ${failedKeys}**\n`;
      } else if (evalRes.verdict === 'possibly_eligible') {
        evalNote = isTa ? `\nℹ️ **கூடுதல் விவரங்கள் தேவைப்படலாம்.**\n` : `\nℹ️ **Additional details may be required to confirm eligibility.**\n`;
      }
    }

    const bulletsText = presented.bullets.map(b => `• ${b}`).join('\n');
    answerText = isTa
      ? `**${presented.name}** - தகுதி நிபந்தனைகள்:${evalNote}\n\n${bulletsText}\n\nவிண்ணப்பிக்க குடும்ப அட்டை மற்றும் ஆதார் தேவை.`
      : `**${presented.name}** - Eligibility Criteria:${evalNote}\n\n${bulletsText}\n\nApply via official e-Sevai or portal.`;

  } else if (intent === 'documents') {
    const docs = (presented.documents && presented.documents.length > 0)
      ? presented.documents
      : (primaryScheme.requiredDocuments || primaryScheme.docs || ['Ration Card / குடும்ப அட்டை', 'Aadhaar Card / ஆதார் அட்டை', 'Bank Passbook / வங்கி கணக்கு புத்தகம்']);
    const docsList = docs.map(d => `• ${d}`).join('\n');

    answerText = isTa
      ? `**${presented.name}** திட்டத்திற்கு தேவையான ஆவணங்கள்:\n\n${docsList}\n\nஅனைத்து ஆவணங்களின் அசல் மற்றும் நகல்களை தயாராக வைத்திருக்கவும்.`
      : `**${presented.name}** - Required Documents:\n\n${docsList}\n\nKeep both original and photocopies ready when applying.`;

  } else if (intent === 'how_to_apply') {
    const steps = (presented.steps && presented.steps.length > 0)
      ? presented.steps
      : (primaryScheme.howToApply || primaryScheme.steps || [
          'Visit nearest e-Sevai centre or taluk office.',
          'Fill in the application form with required certificates.',
          'Collect the acknowledgement slip with tracking number.'
        ]);
    const stepsList = steps.map((s, idx) => `${idx + 1}. ${s}`).join('\n');

    const troubleshootText = isTa
      ? `\n\n📌 **பயன் பெற முடியவில்லை அல்லது தாமதமானால் என்ன செய்வது?**\n` +
        `• உங்கள் விண்ணப்ப எண்ணை (Ack Ref No) வைத்து அருகிலுள்ள இ-சேவை மையத்தில் நிலையை சரிபார்க்கவும்.\n` +
        `• ஆதார் மற்றும் வங்கிக் கணக்கு NPCI இணைப்பு (Aadhaar seeding) சரியாக உள்ளதா என உறுதிப்படுத்தவும்.\n` +
        `• நியாயமற்ற நிராகரிப்பு ஏற்பட்டால், மாவட்ட ஆட்சியர் அலுவலக மக்கள் குறைதீர்க்கும் நாள் கூட்டத்தில் (திங்கட்கிழமை) மனு அளிக்கலாம் அல்லது முதல்வர் உதவி எண் **1100**-ஐ அழைக்கலாம்.`
      : `\n\n📌 **What to do if you cannot get the benefit / Application delayed?**\n` +
        `• **Track Status:** Check your application status with your reference number at the e-Sevai centre or portal.\n` +
        `• **Aadhaar-Bank Link:** Ensure your bank account is seeded with Aadhaar (NPCI mapping active) for DBT transfers.\n` +
        `• **Grievance Support:** If unfairly delayed or rejected, present a petition at your District Collectorate Grievance Day (every Monday) or call the CM Helpline **1100**.`;

    answerText = isTa
      ? `**${presented.name}** திட்டத்திற்கு விண்ணப்பிக்கும் முறை:\n\n${stepsList}\n\nஅதிகாரப்பூர்வ தளம்: ${primaryScheme.sourceUrl || 'https://tnesevai.tn.gov.in'}${troubleshootText}`
      : `**${presented.name}** - How to Apply:\n\n${stepsList}\n\nOfficial Portal: ${primaryScheme.sourceUrl || 'https://tnesevai.tn.gov.in'}${troubleshootText}`;

  } else if (intent === 'official_link') {
    const url = primaryScheme.sourceUrl || (primaryScheme.officialLinks && primaryScheme.officialLinks[0] ? (Array.isArray(primaryScheme.officialLinks[0]) ? primaryScheme.officialLinks[0][1] : primaryScheme.officialLinks[0].url || primaryScheme.officialLinks[0]) : 'https://www.tn.gov.in');
    answerText = isTa
      ? `**${presented.name}** அதிகாரப்பூர்வ இணையதளம்:\n\n🔗 ${url}\n\nஇத்தளம் தமிழ்நாடு அரசால் அங்கீகரிக்கப்பட்டது.`
      : `**${presented.name}** - Official Government Portal:\n\n🔗 ${url}\n\nThis is an official Tamil Nadu government link.`;

  } else if (intent === 'status' || intent === 'deadline') {
    const appStatus = primaryScheme.applicationStatus || 'open';
    const deadline = primaryScheme.applicationDeadline || 'No immediate closing deadline announced';
    answerText = isTa
      ? `**${presented.name}** விண்ணப்ப நிலை & கடைசி தேதி:\n\n• நிலை: **${appStatus.toUpperCase()}**\n• கடைசி தேதி: **${deadline}**\n\nதொடர்ந்து அதிகாரப்பூர்வ போர்ட்டலை சரிபார்க்கவும்.`
      : `**${presented.name}** - Application Status & Deadline:\n\n• Current Status: **${appStatus.toUpperCase()}**\n• Deadline / Window: **${deadline}**\n\nCheck official notifications for extensions.`;

  } else if (intent === 'what_changed') {
    const history = primaryScheme.changeHistory || [];
    if (history.length > 0) {
      const changesList = history.map(h => `• ${h.field}: "${h.oldValue}" -> "${h.newValue}" (Quote: "${h.quote}") on ${new Date(h.date).toLocaleDateString()}`).join('\n');
      answerText = isTa
        ? `**${presented.name}** அண்மைய மாற்றங்கள்:\n\n${changesList}`
        : `**${presented.name}** - Recent Changes:\n\n${changesList}`;
    } else {
      answerText = isTa
        ? `**${presented.name}** திட்டத்தில் சமீபத்தில் எந்த மாற்றங்களும் பதிவு செய்யப்படவில்லை.`
        : `**${presented.name}** - No recent rule or benefit changes have been recorded.`;
    }

  } else {
    // General scheme summary
    answerText = isTa
      ? `**${presented.name}**\n\n${presented.summary}\n\n• பயன்: **${presented.benefit}**\n• அதிகாரப்பூர்வ தளம்: ${primaryScheme.sourceUrl || 'tn.gov.in'}\n\n*(அரசு அதிகாரப்பூர்வ தகவல்களிலிருந்து உருவாக்கப்பட்டது)*`
      : `**${presented.name}**\n\n${presented.summary}\n\n• Benefit: **${presented.benefit}**\n• Official Portal: ${primaryScheme.sourceUrl || 'https://www.tn.gov.in'}\n\n*(Rule-based assistant using official verified facts)*`;
  }

  return {
    answer: answerText,
    intent,
    scheme: primaryScheme.name,
    language: detectedLang
  };
}

module.exports = {
  answerRuleBasedChat,
  detectIntent,
  detectLanguage,
  findSchemesInQuery
};
