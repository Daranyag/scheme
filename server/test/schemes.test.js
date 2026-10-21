require('dotenv').config();
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const schemesRouter = require('../routes/schemes');
const Scheme = require('../models/Scheme');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use('/api/schemes', schemesRouter);

jest.setTimeout(30000);

describe('GET /api/schemes API Test', () => {
  beforeAll(async () => {
    // Safety guard: NEVER connect to production MONGODB_URI in tests
    const mongoUri = process.env.MONGODB_TEST_URI;
    if (mongoUri && !mongoUri.includes('mongodb.net') && !mongoUri.includes('mongodb+srv')) {
      try {
        await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 1000 });
      } catch (_) {}
    }

    const starterFile = path.join(__dirname, '..', 'data', 'starter-schemes.json');
    const data = JSON.parse(fs.readFileSync(starterFile, 'utf8'));
    const approvedData = data.filter(item => item.reviewStatus !== 'rejected');

    if (mongoose.connection.readyState !== 1) {
      jest.spyOn(Scheme, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue(approvedData)
      });
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  });

  test('GET /api/schemes returns approved schemes with non-empty names', async () => {
    const res = await request(app).get('/api/schemes');
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBe(true);

    res.body.forEach((scheme) => {
      expect(scheme.name).toBeDefined();
      expect(typeof scheme.name).toBe('string');
      expect(scheme.name.trim().length).toBeGreaterThan(0);
      expect(scheme.name.startsWith('Government Scheme')).toBe(false);
      expect(scheme.benefit).toBeDefined();
      expect(scheme.rules).toBeDefined();
      expect(scheme.rules).not.toBeNull();
    });
  });
});
