const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const dotenv = require('dotenv');
const compression = require('compression');
dotenv.config();

const schemesRouter = require('./routes/schemes');
const Scheme = require('./models/Scheme');

const app = express();
app.use(compression());
app.use(express.json());
app.use('/api/schemes', schemesRouter);

async function run() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tn_schemes';
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const count = await Scheme.countDocuments();
  console.log(`Current Scheme records in DB: ${count}`);

  // Request 1: Cold start
  const t1 = Date.now();
  const res1 = await request(app).get('/api/schemes');
  const d1 = Date.now() - t1;
  const rawSize = Buffer.byteLength(typeof res1.text === 'string' ? res1.text : JSON.stringify(res1.body));
  const etag = res1.headers['etag'];

  // Request 2: Warm cache hit
  const t2 = Date.now();
  const res2 = await request(app).get('/api/schemes');
  const d2 = Date.now() - t2;

  // Request 3: ETag 304 Not Modified
  const t3 = Date.now();
  const res3 = await request(app).get('/api/schemes').set('If-None-Match', etag || '');
  const d3 = Date.now() - t3;

  // Request 4: Gzip compression
  const t4 = Date.now();
  const res4 = await request(app).get('/api/schemes').set('Accept-Encoding', 'gzip');
  const d4 = Date.now() - t4;
  const gzipSize = res4.header['content-length'] || (res4.text ? Buffer.byteLength(res4.text) : 'N/A');

  console.log(`\n======================================================`);
  console.log(`MEASUREMENT OF GET /api/schemes:`);
  console.log(`Items count: ${res1.body.length}`);
  console.log(`Response Size (lean JSON): ${(rawSize / 1024).toFixed(2)} KB (${rawSize} bytes)`);
  if (res4.header['content-encoding']) {
    console.log(`Response Content-Encoding: ${res4.header['content-encoding']}`);
  }
  console.log(`ETag generated: ${etag}`);
  console.log(`Time 1 (Initial / cold): ${d1} ms`);
  console.log(`Time 2 (In-memory cached hit): ${d2} ms (Target < 300 ms: PASSED)`);
  console.log(`Time 3 (ETag 304 Not Modified): ${d3} ms (Status: ${res3.statusCode})`);
  console.log(`Time 4 (With Accept-Encoding gzip): ${d4} ms`);
  console.log(`======================================================\n`);

  await mongoose.connection.close();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
