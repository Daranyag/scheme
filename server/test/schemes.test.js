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
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tn_schemes_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    try {
      await Scheme.collection.dropIndexes();
    } catch (e) {
      // index reset
    }

    await Scheme.deleteMany({});
    const starterFile = path.join(__dirname, '..', 'data', 'starter-schemes.json');
    const data = JSON.parse(fs.readFileSync(starterFile, 'utf8'));

    const preparedData = data.map((item, idx) => ({
      ...item,
      schemeId: item.schemeId || `starter-scheme-${idx + 1}`,
      schemeName: item.schemeName || item.name,
      department: item.department || item.category || 'General',
      origin: 'starter',
      reviewStatus: 'approved'
    }));

    await Scheme.insertMany(preparedData);
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  test('GET /api/schemes returns 11 schemes with non-empty names', async () => {
    const res = await request(app).get('/api/schemes');
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toEqual(11);

    res.body.forEach((scheme) => {
      expect(scheme.name).toBeDefined();
      expect(typeof scheme.name).toBe('string');
      expect(scheme.name.trim().length).toBeGreaterThan(0);
      expect(scheme.name.startsWith('Government Scheme')).toBe(false);
      expect(scheme.benefit).toBeDefined();
      expect(scheme.benefit.trim().length).toBeGreaterThan(0);
      expect(scheme.rules).toBeDefined();
      expect(scheme.rules).not.toBeNull();
    });
  });
});
