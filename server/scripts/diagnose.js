require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { fetchPage } = require('../lib/fetcher');
const sourcesConfig = require('../sources.json');

async function runDiagnose() {
  console.log('========================================================================================================================');
  console.log('                                       TN SCHEMES & PENSIONS FINDER DIAGNOSTIC REPORT                                   ');
  console.log('========================================================================================================================\n');

  const urlsToTest = new Map(); // url -> label

  // Collect from sources.json
  for (const page of sourcesConfig.officialPages || []) {
    urlsToTest.set(page.url, page.name);
  }

  // Collect from starter-schemes.json
  const starterPath = path.join(__dirname, '..', 'data', 'starter-schemes.json');
  if (fs.existsSync(starterPath)) {
    const starterData = JSON.parse(fs.readFileSync(starterPath, 'utf8'));
    for (const s of starterData) {
      const links = s.officialLinks || s.links || [];
      for (const item of links) {
        let u = '';
        let title = s.name || 'Official Link';
        if (Array.isArray(item)) u = item[1];
        else if (typeof item === 'object' && item !== null) u = item.url || item.link;
        else if (typeof item === 'string') u = item;
        if (u) urlsToTest.set(u, title);
      }
    }
  }

  // Revenue Administration pension pages explicit check
  const craTestPages = [
    'https://cra.tn.gov.in/eleg_schemes.php',
    'https://www.cra.tn.gov.in/eleg_schemes.php',
    'https://www.cra.tn.gov.in/about_schemes.php',
    'https://cra.tn.gov.in/'
  ];
  for (const u of craTestPages) {
    if (!urlsToTest.has(u)) {
      urlsToTest.set(u, 'Revenue Admin Pension Test Page');
    }
  }

  const results = [];

  for (const [url, label] of urlsToTest.entries()) {
    console.log(`Diagnosing: ${url} (${label})...`);
    const res = await fetchPage(url);
    const textPreview = res.text ? res.text.substring(0, 100).replace(/[\r\n]+/g, ' ') : '(None)';
    const certExpiry = res.certInfo ? res.certInfo.validTo : 'N/A';

    results.push({
      url,
      label,
      finalUrl: res.finalUrl || url,
      status: res.status !== null ? res.status : 'ERR',
      errorType: res.errorType || 'none',
      certExpiry,
      durationMs: `${res.durationMs}ms`,
      bytes: res.bytes || 0,
      neededHeadless: res.neededHeadless ? 'YES' : 'NO',
      textPreview
    });

    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n================================================ DIAGNOSIS SUMMARY TABLE ================================================');
  console.table(results.map(r => ({
    'Target URL': r.url.length > 35 ? r.url.substring(0, 32) + '...' : r.url,
    'Final URL': r.finalUrl.length > 35 ? r.finalUrl.substring(0, 32) + '...' : r.finalUrl,
    'Status': r.status,
    'Error Type': r.errorType,
    'TLS Expiry': r.certExpiry !== 'N/A' ? r.certExpiry.split('T')[0] : 'N/A',
    'Time': r.durationMs,
    'Bytes': r.bytes,
    'Headless': r.neededHeadless,
    'Text Preview (100 chars)': r.textPreview.substring(0, 45) + '...'
  })));
  console.log('========================================================================================================================\n');

  // Update server/sources.json working addresses and reasons
  let updatedSources = false;
  for (const page of sourcesConfig.officialPages || []) {
    const r = results.find(item => item.url === page.url);
    if (r) {
      if (r.status === 200 && r.finalUrl !== page.url) {
        console.log(`[SourcesUpdate] Updating working URL for "${page.name}": ${page.url} -> ${r.finalUrl}`);
        page.url = r.finalUrl;
        updatedSources = true;
      } else if (r.status !== 200) {
        console.log(`[SourcesUpdate] Marking unreachable source "${page.name}": ${r.errorType} (${r.status})`);
        page.lastErrorReason = `Unreachable: ${r.errorType} (HTTP ${r.status})`;
        updatedSources = true;
      }
    }
  }

  if (updatedSources) {
    fs.writeFileSync(path.join(__dirname, '..', 'sources.json'), JSON.stringify(sourcesConfig, null, 2));
    console.log('[SourcesUpdate] Updated server/sources.json successfully.');
  }

  // Write log output to logs/diagnose-<date>.txt
  const logsDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
  const logFilePath = path.join(logsDir, `diagnose-${dateStr}.txt`);
  fs.writeFileSync(logFilePath, JSON.stringify(results, null, 2));
  console.log(`Saved diagnostic log to: ${logFilePath}\n`);
}

runDiagnose().catch(err => {
  console.error('Diagnostic error:', err);
  process.exit(1);
});
