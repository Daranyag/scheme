const axios = require('axios');

async function test() {
  const ua = 'TNSchemesBot/1.0 (+https://tn.gov.in/schemes-checker)';
  const urls = [
    'https://www.myscheme.gov.in/search/state/Tamil%20Nadu',
    'https://myscheme.gov.in/search/state/Tamil%20Nadu',
    'https://www.myscheme.gov.in',
    'https://myscheme.gov.in'
  ];
  for (const u of urls) {
    try {
      const res = await axios.get(u, {
        timeout: 25000,
        headers: { 'User-Agent': ua },
        maxRedirects: 5
      });
      console.log(u, '-> STATUS:', res.status, 'FINAL:', res.request?.res?.responseUrl || res.config?.url);
    } catch (e) {
      console.log(u, '-> ERROR:', e.message, 'CODE:', e.code, 'STATUS:', e.response?.status);
    }
  }
}
test();
