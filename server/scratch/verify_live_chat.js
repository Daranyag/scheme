const http = require('http');
const dotenv = require('dotenv');
dotenv.config();

const BASE_URL = 'http://127.0.0.1:3000';

function makeRequest(path, payload, headersOverride = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: '127.0.0.1',
      port: 3000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headersOverride,
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk.toString()));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });

    req.on('error', (err) => resolve({ status: 0, error: err.message }));
    req.write(data);
    req.end();
  });
}

async function runLiveVerification() {
  console.log('==================================================');
  console.log('LIVE CHAT & GEMINI RESILIENCY VERIFICATION');
  console.log('==================================================\n');

  // 1. Streamed Answer: "Which pension can I get?"
  console.log('1. STREAMED ANSWER: "Which pension can I get?"');
  const streamRes = await makeRequest('/api/chat', {
    messages: [{ role: 'user', text: 'Which pension can I get?' }],
    profile: { age: 65, gender: 'F', marital: 'widowed', destitute: true },
    eligibleSchemes: ['Destitute Widow Pension', 'Old Age Pension (IGNOAPS / TN)'],
  });
  console.log(`Status: ${streamRes.status}`);
  if (streamRes.headers) {
    console.log(`Content-Type: ${streamRes.headers['content-type']}`);
  } else {
    console.log(`Error: ${streamRes.error}`);
  }
  console.log('First 250 bytes of SSE output:\n', (streamRes.body || '').substring(0, 250));
  console.log('--------------------------------------------------\n');

  // 2. Fallback Endpoint Answer: "Which pension can I get?"
  console.log('2. NON-STREAMING FALLBACK ENDPOINT: POST /api/chat/simple');
  const simpleRes = await makeRequest('/api/chat/simple', {
    messages: [{ role: 'user', text: 'Which pension can I get?' }],
    profile: { age: 65, gender: 'F', marital: 'widowed', destitute: true },
    eligibleSchemes: ['Destitute Widow Pension'],
  });
  console.log(`Status: ${simpleRes.status}`);
  console.log('Response JSON:', simpleRes.body);
  console.log('--------------------------------------------------\n');

  // 3. Tamil Query Answer: "உதவித்தொகை திட்டங்கள் என்னென்ன?"
  console.log('3. TAMIL ANSWER: "உதவித்தொகை திட்டங்கள் என்னென்ன?"');
  const tamilRes = await makeRequest('/api/chat/simple', {
    messages: [{ role: 'user', text: 'உதவித்தொகை திட்டங்கள் என்னென்ன?' }],
    profile: { age: 60, gender: 'F', marital: 'widowed', destitute: true },
    eligibleSchemes: ['Destitute Widow Pension'],
  });
  console.log(`Status: ${tamilRes.status}`);
  console.log('Tamil Answer JSON:', tamilRes.body);
  console.log('--------------------------------------------------\n');

  // 4. Error Simulation: Invalid API Key
  console.log('4. ERROR SIMULATION: Invalid API Key');
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'invalid_fake_key_123';
  const invalidKeyRes = await makeRequest('/api/chat/simple', {
    messages: [{ role: 'user', text: 'Test' }],
  });
  console.log(`Status: ${invalidKeyRes.status}`);
  console.log('Response Body:', invalidKeyRes.body);
  process.env.GEMINI_API_KEY = originalKey; // restore key
  console.log('--------------------------------------------------\n');

  // 5. Error Simulation: Invalid Model Name
  console.log('5. ERROR SIMULATION: Invalid Model Name');
  const originalModel = process.env.GEMINI_MODEL;
  process.env.GEMINI_MODEL = 'invalid-model-name-999';
  process.env.GEMINI_BACKUP_MODEL = 'invalid-backup-model-999';
  const invalidModelRes = await makeRequest('/api/chat/simple', {
    messages: [{ role: 'user', text: 'Test' }],
  });
  console.log(`Status: ${invalidModelRes.status}`);
  console.log('Response Body:', invalidModelRes.body);
  if (originalModel) process.env.GEMINI_MODEL = originalModel;
  delete process.env.GEMINI_BACKUP_MODEL;
  console.log('--------------------------------------------------\n');
}

runLiveVerification().catch(console.error);
