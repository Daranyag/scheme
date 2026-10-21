const { extractQuoteAround } = require('./fieldExtractors');

class CriteriaParser {
  constructor() {
    this.patterns = [
      {
        regex: /(?:age\s*|aged\s*)?(\d+)\s*(?:years.*?and above|years.*?or more|and above|\+)/i,
        field: 'age',
        op: '$gte',
        type: 'number'
      },
      {
        regex: /(\d+)\s*வயது\s*(?:மற்றும்\s*அதற்கு\s*மேல்|முதல்|\+)/i,
        field: 'age',
        op: '$gte',
        type: 'number'
      },
      {
        regex: /வயது\s*[-–]?\s*(\d+)\s*(?:மற்றும்\s*அதற்கு\s*மேல்)?/i,
        field: 'age',
        op: '$gte',
        type: 'number'
      },
      {
        regex: /(?:annual|family|household)?\s*income.*?(?:not exceed(?:ing)?|below|less than|up to|within).*?rs\.?\s*([\d,]+)/i,
        field: 'annualIncome',
        op: '$lte',
        type: 'number'
      },
      {
        regex: /வருமானம்\s*(?:ரூ\.?|₹)?\s*([\d.]+)\s*(?:இலட்ச|lakh)/i,
        field: 'annualIncome',
        op: '$lte',
        type: 'number_lakh'
      },
      // Asset conditions (e.g. up to ₹1,00,000)
      {
        regex: /(?:அசையா\s*)?சொத்த(?:ு|ின்)?(?:\s*மதிப்பு)?\s*(?:ரூ\.?|₹)?\s*([\d,]+)(?:\s*\/-)?\s*(?:திற்கு\s*மிகாமல்|த்திற்குள்|வரை)/i,
        field: 'assetLimit',
        op: '$lte',
        type: 'number'
      },
      // Desertion years condition (e.g. 5 years)
      {
        regex: /(\d+)\s*ஆண்டுகள்\s*கணவனா(?:ல்|ன்)\s*கைவிடப்பட்ட/i,
        field: 'desertionYears',
        op: '$gte',
        type: 'number'
      },
      // Unemployment & employment conditions
      {
        regex: /வேலையற்ற|unemployed/i,
        field: 'unemployed',
        value: true
      },
      // Residency (Tamil Nadu resident / வசிப்பவர்)
      {
        regex: /தமிழ்நாட்டில்\s*வசி|resident\s*of\s*tamil\s*nadu/i,
        field: 'residency',
        value: 'Tamil Nadu'
      },
      {
        regex: /widow|விதவை|விதவைகள்/i,
        field: 'maritalStatus',
        value: 'widowed'
      },
      {
        regex: /deserted\s*wiv?e?s?|ஆதரவற்ற\s*மனைவி|கைவிடப்பட்ட/i,
        field: 'maritalStatus',
        value: 'deserted'
      },
      {
        regex: /unmarried\s*poor\s*women|திருமணமாகாத\s*(?:ஏழைப்\s*)?பெண்/i,
        field: 'maritalStatus',
        value: 'unmarried'
      },
      {
        regex: /destitute|ஆதரவற்ற/i,
        field: 'destitute',
        value: true
      },
      {
        regex: /(?:மாற்றுத்\s*திறன்|ஊனம்)\s*நிலை\s*[-–]?\s*(\d+)\s*சதவிகிதம்/i,
        field: 'disabilityPercent',
        op: '$gte',
        type: 'number'
      },
      {
        regex: /(\d+)%?\s*(?:or more|and above)?\s*(?:disability|differently abled|மாற்றுத்திறனாளிகள்)/i,
        field: 'disabilityPercent',
        op: '$gte',
        type: 'number'
      },
      {
        regex: /government\s*school.*?6\s*(?:to|–|-)\s*12|அரசுப்\s*பள்ளி/i,
        field: 'govschool',
        value: true
      },
      {
        regex: /woman|women|female|மகளிர்|பெண்/i,
        field: 'gender',
        value: 'F'
      },
      // Community Categories (SC, ST, BC, MBC, Minority)
      {
        regex: /\b(?:scheduled caste|adi dravidar|sc)\b|ஆதி திராவிடர்/i,
        field: 'communityCategory',
        value: 'SC'
      },
      {
        regex: /\b(?:scheduled tribe|tribal|st)\b|பழங்குடியினர்/i,
        field: 'communityCategory',
        value: 'ST'
      },
      {
        regex: /\b(?:most backward class|mbc)\b|மிகவும் பிற்படுத்தப்பட்ட/i,
        field: 'communityCategory',
        value: 'MBC'
      },
      {
        regex: /\b(?:backward class|bc)\b|பிற்படுத்தப்பட்ட/i,
        field: 'communityCategory',
        value: 'BC'
      },
      {
        regex: /\b(?:minority|minorities|muslim|christian|sikh|buddhist|jain|parsi)\b|சிறுபான்மையினர்/i,
        field: 'communityCategory',
        value: 'Minority'
      },
      // Worker Types & Welfare Boards
      {
        regex: /construction worker|கட்டுமானத் தொழிலாளர்/i,
        field: 'workerType',
        value: 'construction'
      },
      {
        regex: /auto(?:-|\s*)driver|driver|ஓட்டுநர்/i,
        field: 'workerType',
        value: 'auto_driver'
      },
      {
        regex: /domestic worker|வீட்டுப் பணியாளர்/i,
        field: 'workerType',
        value: 'domestic_worker'
      },
      {
        regex: /street vendor|vendor|தெருவோர வியாபாரி/i,
        field: 'workerType',
        value: 'vendor'
      },
      {
        regex: /farmer|agricultural labourer|விவசாயி|விவசாயத் தொழிலாளி/i,
        field: 'workerType',
        value: 'farmer'
      },
      {
        regex: /fisherman|fisherfolk|மீனவர்/i,
        field: 'workerType',
        value: 'fisherman'
      },
      {
        regex: /weaver|handloom|நெசவாளர்/i,
        field: 'workerType',
        value: 'weaver'
      },
      {
        regex: /unorganised worker|manual worker|உடலுழைப்புத் தொழிலாளர்/i,
        field: 'workerType',
        value: 'manual_worker'
      },
      // Age range 18 to 60 for worker boards
      {
        regex: /(?:between\s*18\s*(?:and|to|-)\s*60\s*years|aged\s*18\s*(?:to|-)\s*60|18\s*முதல்\s*60\s*வயது)/i,
        field: 'ageRange',
        value: { min: 18, max: 60 }
      },
      // Course Levels
      {
        regex: /\b(?:under\s*graduate|ug|degree|b\.a|b\.sc|b\.com|b\.e|b\.tech)\b|இளங்கலை/i,
        field: 'courseLevel',
        value: 'UG'
      },
      {
        regex: /\b(?:post\s*graduate|pg|master|m\.a|m\.sc|m\.com|m\.e|m\.tech)\b|முதுகலை/i,
        field: 'courseLevel',
        value: 'PG'
      },
      {
        regex: /\b(?:ph\.?d|doctorate|research scholar)\b|முனைவர் பட்ட/i,
        field: 'courseLevel',
        value: 'PhD'
      },
      {
        regex: /\b(?:diploma|polytechnic)\b|டிப்ளமோ/i,
        field: 'courseLevel',
        value: 'diploma'
      },
      {
        regex: /\b(?:iti|industrial training)\b|ஐடிஐ/i,
        field: 'courseLevel',
        value: 'ITI'
      },
      {
        regex: /\b(?:school|classes?\s*(?:1|2|3|4|5|6|7|8|9|10|11|12))\b|பள்ளி/i,
        field: 'courseLevel',
        value: 'school'
      },
      // Disability Boolean
      {
        regex: /differently abled|disabled|handicapped|மாற்றுத்திறனாளி/i,
        field: 'disability',
        value: true
      },
      // Student status
      {
        regex: /\b(?:student|studying|enrolled|மாணவர்|மாணவி|பயிலும்)\b/i,
        field: 'student',
        value: true
      },
      // Government service & pension status
      {
        regex: /\b(?:government employee|government servant|state government employee|அரசு ஊழியர்)\b/i,
        field: 'govtService',
        value: true
      },
      {
        regex: /\b(?:pensioner|retired government employee|ஓய்வூதியதாரர்)\b/i,
        field: 'pensioner',
        value: true
      },
      // Land limits (e.g. 5 acres wetland / நஞ்சை நிலம்)
      {
        regex: /(?:wetland|dryland|land)?\s*(?:not exceeding|up to|below)?\s*(\d+(?:\.\d+)?)\s*(?:acres|ஏக்கர்)/i,
        field: 'landLimitAcres',
        op: '$lte',
        type: 'number'
      }
    ];
  }

  parse(text) {
    const rules = {};
    const facts = [];
    const unmapped = [];
    let matchedAny = false;

    if (!text || typeof text !== 'string') {
      return { rules, facts, unmapped };
    }

    for (const pattern of this.patterns) {
      const match = text.match(pattern.regex);
      if (match) {
        matchedAny = true;
        const quote = extractQuoteAround(text, match.index, match[0].length, 20);

        if (pattern.value !== undefined) {
          if (!rules[pattern.field]) {
            rules[pattern.field] = pattern.value;
          }
          facts.push({
            field: pattern.field,
            value: pattern.value,
            quote,
            confidence: 0.95,
            extractedBy: 'rules'
          });
        } else if (match[1]) {
          let numValue = parseInt(match[1].replace(/,/g, ''), 10);
          if (pattern.type === 'number_lakh') {
            numValue = Math.round(parseFloat(match[1]) * 100000);
          }
          if (!isNaN(numValue)) {
            if (pattern.op) {
              rules[pattern.field] = { [pattern.op]: numValue };
            } else {
              rules[pattern.field] = numValue;
            }
            facts.push({
              field: pattern.field,
              value: pattern.op ? { [pattern.op]: numValue } : numValue,
              quote,
              confidence: 0.95,
              extractedBy: 'rules'
            });
          }
        }
      }
    }

    if (!matchedAny) {
      unmapped.push(text.trim());
    }

    return { rules, facts, unmapped };
  }
}

module.exports = CriteriaParser;
