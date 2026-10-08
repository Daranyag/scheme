const axios = require('axios');
const https = require('https');

const urlsToTest = [
  // Revenue Admin
  'https://cra.tn.gov.in/eleg_schemes.php',
  'https://www.cra.tn.gov.in/eleg_schemes.php',
  'https://www.cra.tn.gov.in/about_schemes.php',
  'https://cra.tn.gov.in',
  'https://www.cra.tn.gov.in',

  // Social Welfare
  'https://tnsocialwelfare.tn.gov.in/en/specilisationswoman-welfare/pudhumai-penn',
  'https://www.tnsocialwelfare.tn.gov.in/en/specilisationswoman-welfare/pudhumai-penn',

  // e-Sevai
  'https://www.tnesevai.tn.gov.in',
  'https://tnesevai.tn.gov.in',

  // CMCHIS
  'https://www.cmchistn.com/',
  'https://cmchistn.com/',

  // KMUT
  'https://kmut.tn.gov.in',
  'https://www.kmut.tn.gov.in',

  // Naan Mudhalvan
  'https://naanmudhalvan.tn.gov.in',
  'https://www.naanmudhalvan.tn.gov.in',
  'https://portal.naanmudhalvan.tn.gov.in',

  // UMIS
  'https://umis.tn.gov.in',
  'https://www.umis.tn.gov.in',

  // MyScheme
  'https://www.myscheme.gov.in/search/state/Tamil%20Nadu',
  'https://myscheme.gov.in/search/state/Tamil%20Nadu'
];

const userAgent = 'TNSchemesBot/1.0 (+https://tn.gov.in/schemes-checker)';

async function testUrl(url) {
  try {
    const res = await axios.get(url, {
      timeout: 25000,
      headers: { 'User-Agent': userAgent },
      maxRedirects: 5,
      validateStatus: false
    });
    const finalUrl = res.request?.res?.responseUrl || res.config?.url || url;
    return { url, status: res.status, finalUrl, ok: res.status >= 200 && res.status < 400 };
  } catch (err) {
    let errorType = err.message;
    if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
      errorType = 'timeout';
    } else if (err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || err.code === 'CERT_HAS_EXPIRED' || err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || err.code === 'ERR_TLS_CERT_ALTNAME_INVALID' || err.message.includes('certificate') || err.message.includes('TLS') || err.message.includes('SSL')) {
      errorType = 'tls_error';
    }
    return { url, status: null, error: errorType, code: err.code };
  }
}

async function run() {
  console.log('Testing URLs...');
  for (const u of urlsToTest) {
    const res = await testUrl(u);
    console.log(JSON.stringify(res));
    await new Promise(r => setTimeout(r, 1000));
  }
}

run();
