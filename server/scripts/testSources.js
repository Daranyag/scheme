const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { fetchPage } = require('../lib/fetcher'); // Assuming fetcher has the needed tools
const sourcesJson = require('../sources.json');

const candidates = [
  "https://cra.tn.gov.in/eleg_schemes.php",
  "https://www.cra.tn.gov.in/about_schemes.php",
  "https://www.tnesevai.tn.gov.in",
  "https://www.karuvoolam.tn.gov.in/web/tnta/pension",
  "https://www.karuvoolam.tn.gov.in/web/tnta/treasuries-n-accounts",
  "https://tnpensioner.tn.gov.in/pensionportal/",
  "https://www.tn.gov.in/department/9",
  "http://cps.tn.gov.in/",
  "http://www.tnnhis2018.in/TnHome.aspx", // reputable, not gov.in
  "https://tnsocialwelfare.tn.gov.in/en/specilisationswoman-welfare/pudhumai-penn",
  "https://umis.tn.gov.in",
  "https://www.cmchistn.com/",
  "https://naanmudhalvan.tn.gov.in",
  "https://portal.naanmudhalvan.tn.gov.in",
  "https://kmut.tn.gov.in", // expected tls expired
  "https://www.myscheme.gov.in",
  "https://nsap.nic.in",
  "https://scholarships.gov.in",
  "https://pmkisan.gov.in",
  "https://www.pib.gov.in",
  "https://www.india.gov.in",
  "https://data.gov.in"
];

async function testCandidate(url) {
  console.log(`Testing ${url}...`);
  try {
    const res = await fetchPage(url);
    const robotsAllowed = res.errorType === 'blocked_robots' ? 'no' : 'yes';
    const status = res.status || 'N/A';
    const finalUrl = res.finalUrl || url;
    const errorType = res.errorType || 'none';
    const tlsExpiry = res.certInfo ? res.certInfo.validTo : 'N/A';
    const speed = res.durationMs + 'ms';
    const length = res.text ? res.text.length : 0;
    
    let verdict = 'use';
    if (!res.ok) {
        verdict = res.errorType === 'tls_expired' ? 'skip (tls)' : 'needs review';
    }
    
    return {
      url, finalUrl, status, errorType, tlsExpiry, speed, robotsAllowed, length, verdict
    };
  } catch (err) {
    return { url, finalUrl: url, status: 'ERR', errorType: err.message, tlsExpiry: 'N/A', speed: 'N/A', robotsAllowed: 'unknown', length: 0, verdict: 'needs review' };
  }
}

async function run() {
  const results = [];
  for (const c of candidates) {
    const r = await testCandidate(c);
    results.push(r);
  }
  
  console.table(results);
  
  const logDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
  }
  const dateStr = new Date().toISOString().split('T')[0];
  const file = path.join(logDir, `sources-${dateStr}.txt`);
  fs.writeFileSync(file, JSON.stringify(results, null, 2));
  console.log(`Results saved to ${file}`);
}

run().catch(console.error);
