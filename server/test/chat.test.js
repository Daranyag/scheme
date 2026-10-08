const request = require('supertest');
const app = require('../server');
const { mapGeminiErrorCode, PRIMARY_MODEL, BACKUP_MODEL } = require('../services/geminiService');

jest.setTimeout(30000);

describe('Server Chat API & Gemini Resiliency Tests', () => {

  test('CORS preflight OPTIONS /api/chat allows headers and methods', async () => {
    const res = await request(app)
      .options('/api/chat')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type, Authorization, x-device-id');

    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  test('POST /api/chat/simple returns non-streaming JSON answer', async () => {
    const res = await request(app)
      .post('/api/chat/simple')
      .send({
        messages: [{ role: 'user', text: 'Which pension can I get?' }],
        profile: { age: 65, gender: 'F', marital: 'widowed', destitute: true },
        eligibleSchemes: ['Destitute Widow Pension'],
      });

    expect([200, 429]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(res.body.code).toBe('ok');
      expect(res.body.answer).toBeDefined();
    } else {
      expect(res.body.code).toBe('ai_quota_exhausted');
      expect(res.body.error).toBe('The AI assistant has reached its usage limit for now. Please try again later.');
    }
  });

  test('Error code mapping correctly maps Gemini exceptions', () => {
    expect(mapGeminiErrorCode({ status: 401, message: 'invalid key' }).code).toBe('ai_key_invalid');
    expect(mapGeminiErrorCode({ status: 404, message: 'model not found' }).code).toBe('ai_model_not_found');
    expect(mapGeminiErrorCode({ status: 503, message: 'UNAVAILABLE' }).code).toBe('ai_busy');
    expect(mapGeminiErrorCode({ status: 429, message: 'quota exceeded' }).code).toBe('ai_quota_exhausted');
  });

  test('POST /api/chat responds with text/event-stream headers', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({
        messages: [{ role: 'user', text: 'Hello' }],
        profile: { age: 30, gender: 'F' },
      });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['x-accel-buffering']).toBe('no');
    expect(res.text).toContain('data:');
  });
});
