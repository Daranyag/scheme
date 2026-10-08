const http = require('http');

function testHealth() {
  return new Promise((resolve) => {
    const req = http.request(
      'http://localhost:3000/api/health',
      { method: 'GET' },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          console.log('GET /api/health Response:');
          console.log(`  Status: ${res.statusCode}`);
          console.log(`  Headers:`, res.headers);
          console.log(`  Body:`, body.substring(0, 200));
          resolve();
        });
      }
    );
    req.on('error', (e) => {
      console.log('GET /api/health error:', e.message);
      resolve();
    });
    req.end();
  });
}

function testChatStream() {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      messages: [{ role: 'user', text: 'Which pension can I get?' }],
      profile: { age: 65, gender: 'F', marital: 'widowed', destitute: true },
      eligibleSchemes: ['Destitute Widow Pension'],
    });

    const req = http.request(
      'http://localhost:3000/api/chat',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = '';
        console.log('\nPOST /api/chat Response:');
        console.log(`  Status: ${res.statusCode}`);
        console.log(`  Headers:`, res.headers);

        res.on('data', (chunk) => {
          body += chunk.toString();
          if (body.length > 300) {
            // print first snippet
          }
        });
        res.on('end', () => {
          console.log(`  First 300 bytes of response:\n${body.substring(0, 300)}`);
          resolve();
        });
      }
    );
    req.on('error', (e) => {
      console.log('POST /api/chat error:', e.message);
      resolve();
    });
    req.write(data);
    req.end();
  });
}

async function run() {
  await testHealth();
  await testChatStream();
}

run();
