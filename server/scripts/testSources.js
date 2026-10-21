const fs = require('fs');
const path = require('path');
const { fetchPage } = require('../lib/fetcher');

const candidates = [
  // Welfare and Social Justice
  { url: "https://www.tnadw.tn.gov.in/", category: "Welfare", name: "Adi Dravidar Welfare" },
  { url: "https://tnadtwscholarship.tn.gov.in/", category: "Scholarships", name: "ADTW Scholarship Portal" },
  { url: "https://www.tntribalwelfare.tn.gov.in/", category: "Welfare", name: "Tribal Welfare Department" },
  { url: "https://www.tahdco.tn.gov.in", category: "Welfare", name: "TAHDCO" },
  { url: "https://bcmbcmw.tn.gov.in", category: "Welfare", name: "BC MBC Minorities Welfare" },
  { url: "https://tndce.tn.gov.in/Home/scholarship", category: "Scholarships", name: "Directorate of Collegiate Education Scholarships" },
  { url: "https://tnsocialwelfare.tn.gov.in/en/specilisationswoman-welfare/pudhumai-penn", category: "Women and Child", name: "Social Welfare Department" },
  
  // Workers
  { url: "https://tnuwwb.tn.gov.in/", category: "Workers", name: "Unorganised Workers Welfare Boards" },
  { url: "https://labour.tn.gov.in", category: "Workers", name: "Labour Welfare and Skill Development" },

  // Pensions and Employees
  { url: "https://cra.tn.gov.in/eleg_schemes.php", category: "Pensions", name: "Revenue Administration Pensions" },
  { url: "https://www.karuvoolam.tn.gov.in/web/tnta/pension", category: "Pensions", name: "Treasuries and Accounts" },
  { url: "https://tnpensioner.tn.gov.in/pensionportal/", category: "Pensions", name: "TN Pensioner Portal" },
  { url: "https://www.tnnhis2018.in/TnHome.aspx", category: "Health", name: "TNNHIS Portal" },

  // Education
  { url: "https://umis.tn.gov.in", category: "Education", name: "UMIS Portal" },
  { url: "https://naanmudhalvan.tn.gov.in", category: "Education", name: "Naan Mudhalvan" },
  { url: "https://skilldevelopment.tn.gov.in/", category: "Education", name: "Skill Development TN" },

  // Health, Rural and Agriculture
  { url: "https://www.cmchistn.com/", category: "Health", name: "CMCHIS" },
  { url: "https://www.tn.gov.in/department/1", category: "Agriculture", name: "Agriculture and Farmers Welfare" },
  { url: "https://www.tn.gov.in/department/2", category: "Fisheries", name: "Fisheries and Animal Husbandry" },
  { url: "https://www.tn.gov.in/department/13", category: "Housing", name: "TNUHDB Housing" },

  // Central schemes for TN Residents
  { url: "https://scholarships.gov.in", category: "Central", name: "National Scholarship Portal" },
  { url: "https://socialjustice.gov.in", category: "Central", name: "Ministry of Social Justice" },
  { url: "https://tribal.gov.in", category: "Central", name: "Ministry of Tribal Affairs" },
  { url: "https://nsap.nic.in", category: "Central", name: "NSAP Social Assistance" },
  { url: "https://pmkisan.gov.in", category: "Central", name: "PM-KISAN" },
  { url: "https://pmjay.gov.in", category: "Central", name: "PM-JAY" },
  { url: "https://eshram.gov.in", category: "Central", name: "e-Shram Portal" },
  { url: "https://www.myscheme.gov.in", category: "Central", name: "MyScheme Portal" },
  { url: "https://www.india.gov.in", category: "Central", name: "India Portal" },
  { url: "https://data.gov.in", category: "Central", name: "Open Government Data" },

  // Announcements
  { url: "https://www.pib.gov.in", category: "Announcements", name: "PIB News & Announcements" },
  { url: "https://www.tn.gov.in/department/14", category: "Announcements", name: "DIPR Press Releases" }
];

async function testCandidate(c) {
  const url = c.url;
  process.stdout.write(`Testing [${c.category}] ${c.name} (${url})... `);
  try {
    const res = await fetchPage(url, { customDelays: [300], maxRetries: 1, timeoutMs: 6000 });
    const robotsAllowed = res.errorType === 'blocked_robots' ? 'no' : 'yes';
    const status = res.status || 'N/A';
    const finalUrl = res.finalUrl || url;
    const errorType = res.errorType || 'none';
    const tlsExpiry = res.certInfo ? res.certInfo.validTo : 'N/A';
    const speed = res.durationMs + 'ms';
    const length = res.text ? res.text.length : 0;
    
    let verdict = 'use';
    let trustLevel = 'official';
    if (url.includes('tnnhis') || url.includes('myscheme')) {
      trustLevel = 'reputable';
    }

    if (!res.ok) {
      if (res.errorType === 'tls_expired') {
        verdict = 'rejected (tls_expired)';
      } else if (res.errorType === 'blocked_robots') {
        verdict = 'rejected (robots_disallowed)';
      } else if (res.errorType === 'timeout') {
        verdict = 'rejected (slow/timeout)';
      } else {
        verdict = `rejected (${res.errorType || 'http_' + status})`;
      }
    } else if (length < 150) {
      verdict = 'rejected (empty/js_only)';
    }

    console.log(verdict);

    return {
      name: c.name,
      category: c.category,
      url,
      finalUrl,
      trustLevel,
      status,
      errorType,
      tlsExpiry,
      speed,
      robotsAllowed,
      bytes: length,
      verdict,
      reason: res.ok ? 'Verified working from this machine' : (res.errorMessage || res.errorType || 'Failed')
    };
  } catch (err) {
    console.log('rejected (' + err.message + ')');
    return {
      name: c.name,
      category: c.category,
      url,
      finalUrl: url,
      trustLevel: 'official',
      status: 'ERR',
      errorType: err.message,
      tlsExpiry: 'N/A',
      speed: 'N/A',
      robotsAllowed: 'unknown',
      bytes: 0,
      verdict: 'rejected (error)',
      reason: err.message
    };
  }
}

async function run() {
  console.log('================================================================================');
  console.log('               ADVANCED FETCHING v3 - SOURCE REGISTRY TEST SUITE                ');
  console.log('================================================================================\n');

  const results = [];
  for (const c of candidates) {
    const r = await testCandidate(c);
    results.push(r);
  }
  
  console.log('\n============================= CANDIDATE SOURCE EVALUATION =============================');
  console.table(results.map(r => ({
    'Source Name': r.name,
    'Category': r.category,
    'Status': r.status,
    'Verdict': r.verdict,
    'Bytes': r.bytes,
    'Speed': r.speed,
    'Reason': r.reason.length > 35 ? r.reason.substring(0, 32) + '...' : r.reason
  })));
  console.log('========================================================================================\n');

  const accepted = results.filter(r => r.verdict === 'use');
  const rejected = results.filter(r => r.verdict !== 'use');

  console.log(`TOTAL CANDIDATES: ${results.length}`);
  console.log(`ACCEPTED (WORKING FROM THIS MACHINE): ${accepted.length}`);
  console.log(`REJECTED: ${rejected.length}\n`);

  // Save detailed reports to logs
  const logDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
  }
  const dateStr = new Date().toISOString().split('T')[0];
  const fileJson = path.join(logDir, `sources-${dateStr}.json`);
  const fileTxt = path.join(logDir, `sources-${dateStr}.txt`);

  fs.writeFileSync(fileJson, JSON.stringify(results, null, 2));

  let txtContent = `ADVANCED FETCHING v3 SOURCE TEST RESULTS (${new Date().toISOString()})\n\n`;
  txtContent += `ACCEPTED SOURCES (${accepted.length}):\n`;
  accepted.forEach(a => {
    txtContent += `+ [${a.category}] ${a.name} (${a.url}) - ${a.bytes} bytes, ${a.speed}\n`;
  });
  txtContent += `\nREJECTED SOURCES (${rejected.length}):\n`;
  rejected.forEach(r => {
    txtContent += `- [${r.category}] ${r.name} (${r.url}) - ${r.verdict}: ${r.reason}\n`;
  });

  fs.writeFileSync(fileTxt, txtContent);
  console.log(`Reports saved to:\n  - ${fileJson}\n  - ${fileTxt}`);
}

run().catch(console.error);
