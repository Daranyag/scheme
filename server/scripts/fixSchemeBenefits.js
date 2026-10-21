require('dotenv').config();
const mongoose = require('mongoose');
const { ensureDnsForUri, getMongoOptions } = require('../lib/mongo');
const Scheme = require('../models/Scheme');
const { invalidateCache } = require('../lib/schemesCache');

async function fixDescriptions() {
  const uri = process.env.MONGODB_URI;
  await ensureDnsForUri(uri);
  await mongoose.connect(uri, getMongoOptions());
  console.log('Connected to DB');

  const schemes = await Scheme.find({});
  console.log('Total schemes in DB:', schemes.length);

  let updatedCount = 0;

  for (const s of schemes) {
    let changed = false;

    // 1. Clean bloated names (e.g. Abolition of Bonded Labour System Associated Scheme: ...)
    if (s.name && s.name.includes('Associated Scheme:')) {
      const cleanName = s.name.split('Associated Scheme:')[0].trim();
      if (cleanName.length > 3) {
        console.log(`Fixing Name: "${s.name.substring(0, 30)}..." -> "${cleanName}"`);
        s.name = cleanName;
        changed = true;
      }
    }

    // 2. Fix 1-word or placeholder benefits using Description from rawSourceText or unmappedCriteria
    const currentBenefit = (s.benefit || '').trim();
    const isGenericBenefit = [
      'Subsidy', 'Grants', 'Marriage Assistance', 'Incentives',
      'Education Benefits', 'Hostel Facilities', 'Funeral Expenses'
    ].includes(currentBenefit) || currentBenefit.length <= 15;

    if (isGenericBenefit && s.rawSourceText) {
      // Try to find Description: ... in rawSourceText
      const descMatch = s.rawSourceText.match(/Description:\s*([^\n\r]+)/i);
      if (descMatch && descMatch[1]) {
        let descText = descMatch[1]
          .replace(/Scheme Type:.*/i, '')
          .replace(/Uploaded File:.*/i, '')
          .trim();

        // Also remove repetitive prefix if description repeats the scheme name
        if (descText.toLowerCase().startsWith(s.name.toLowerCase())) {
          descText = descText.substring(s.name.length).replace(/^[\s\-–—:]+/, '').trim();
        }

        if (descText.length > 15) {
          console.log(`Updating Benefit for "${s.name}":\n  Old: "${s.benefit}"\n  New: "${descText.substring(0, 80)}..."`);
          s.benefit = descText;
          changed = true;
        }
      }
    }

    // 3. Fix unmappedCriteria if it got flooded with the full page text
    if (Array.isArray(s.unmappedCriteria) && s.unmappedCriteria.length > 0) {
      const cleanedCriteria = [];
      for (const crit of s.unmappedCriteria) {
        if (crit.includes('Associated Scheme:') || crit.length > 150) {
          // Extract just Beneficiaries if present
          const benefMatch = crit.match(/Beneficiaries:\s*([^\n\r]+)/i);
          if (benefMatch && benefMatch[1]) {
            const bVal = benefMatch[1].split(/(?:Types of Benefits|Eligibility criteria|Description):/i)[0].trim();
            if (bVal) {
              cleanedCriteria.push(`Target Beneficiaries: ${bVal}`);
              changed = true;
              continue;
            }
          }
          // If already starts with Target Beneficiaries:
          const targetMatch = crit.match(/Target Beneficiaries:\s*([^:]+?)(?:\s+(?:Associated|Types of|Eligibility|Income):|$)/i);
          if (targetMatch && targetMatch[1]) {
            cleanedCriteria.push(`Target Beneficiaries: ${targetMatch[1].trim()}`);
            changed = true;
            continue;
          }
        }
        cleanedCriteria.push(crit);
      }
      if (changed) {
        s.unmappedCriteria = cleanedCriteria;
      }
    }

    // 4. Fix howToApply if it got flooded with the full page text
    if (Array.isArray(s.howToApply) && s.howToApply.length > 0) {
      const cleanedSteps = [];
      for (const step of s.howToApply) {
        if (step.includes('Validity of the Scheme:') || step.length > 150) {
          const cleanStep = step.split(/(?:Validity of the Scheme|Introduced On|Description):/i)[0].trim();
          if (cleanStep) {
            cleanedSteps.push(cleanStep);
            changed = true;
            continue;
          }
        }
        cleanedSteps.push(step);
      }
      if (changed) {
        s.howToApply = cleanedSteps;
      }
    }

    if (changed) {
      await s.save();
      updatedCount++;
    }
  }

  console.log(`Successfully updated ${updatedCount} schemes.`);
  invalidateCache();
  await mongoose.disconnect();
  console.log('Done!');
}

fixDescriptions().catch(err => {
  console.error('Error fixing descriptions:', err);
  process.exit(1);
});
