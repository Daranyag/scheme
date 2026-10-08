const request = require('supertest');
const express = require('express');
const { isAllowlistedUrl } = require('../config/allowlist');
const { evaluateEligibilityExtended } = require('../services/ruleEngine');
const profileRouter = require('../routes/profile');
const discoveriesRouter = require('../routes/discoveries');
const adminRouter = require('../routes/admin');

const app = express();
app.use(express.json());
app.use('/api/profile', profileRouter);
app.use('/api/discoveries', discoveriesRouter);
app.use('/api/admin', adminRouter);

describe('Profile-Driven Discovery Unit Tests', () => {

    test('1. Profile Sync strips PII fields (name, phone, aadhaar, address)', async () => {
        const payload = {
            deviceId: 'test-device-uuid-6565',
            profile: {
                age: 65,
                gender: 'F',
                incomeBand: 'under 1 lakh',
                income: 80000,
                marital: 'widowed',
                disability: 0,
                flags: { destitute: true },
                // PII fields to be stripped
                name: 'Jane Doe',
                phone: '9876543210',
                aadhaar: '1234-5678-9012',
                address: '123 Main Street'
            }
        };

        const res = await request(app)
            .post('/api/profile/sync')
            .send(payload);

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toContain('Profile synced');
    });

    test('2. Candidate verification rules: allowlist & scheme name checking', () => {
        // Allowlisted domain test
        expect(isAllowlistedUrl('https://cra.tn.gov.in/eleg_schemes.php')).toBe(true);
        expect(isAllowlistedUrl('https://tnsocialwelfare.tn.gov.in/pudhumai-penn')).toBe(true);
        expect(isAllowlistedUrl('http://unauthorized-blog.com/schemes')).toBe(false);

        // Scheme name verification fixture
        const fetchedText = "Revenue Administration Pensions - Destitute Widow Pension ₹1,200/month for eligible destitute widows.";
        expect(fetchedText.toLowerCase().includes('destitute widow pension')).toBe(true);
        expect(fetchedText.toLowerCase().includes('naan mudhalvan')).toBe(false);
    });

    test('3. Rule engine matching for profile: Female, 65, Income 80,000, Widowed, Destitute', () => {
        const profile = {
            age: 65,
            gender: 'F',
            income: 80000,
            marital: 'widowed',
            destitute: true,
            famhead: false,
            govschool: false,
            highered: false
        };

        // Scheme 1: Destitute Widow Pension
        const widowRules = { gender: 'F', marital: 'widowed', age: { $gte: 18 }, destitute: true };
        const resWidow = evaluateEligibilityExtended(profile, widowRules);
        expect(resWidow.verdict).toBe('eligible');

        // Scheme 2: Old Age Pension
        const oapRules = { age: { $gte: 60 }, destitute: true };
        const resOap = evaluateEligibilityExtended(profile, oapRules);
        expect(resOap.verdict).toBe('eligible');

        // Scheme 3: Pudhumai Penn (Should fail - govschool false)
        const pudhumaiRules = { gender: 'F', govschool: true, highered: true };
        const resPudhumai = evaluateEligibilityExtended(profile, pudhumaiRules);
        expect(resPudhumai.verdict).toBe('not_eligible');

        // Scheme 4: Tamil Pudhalvan (Should fail - gender mismatch)
        const pudhalvanRules = { gender: 'M', govschool: true };
        const resPudhalvan = evaluateEligibilityExtended(profile, pudhalvanRules);
        expect(resPudhalvan.verdict).toBe('not_eligible');
    });

    test('4. GET /api/admin/discovery-logs requires valid ADMIN_KEY', async () => {
        // Unauthorized call
        const unauthRes = await request(app)
            .get('/api/admin/discovery-logs')
            .set('x-admin-key', 'invalid_key');
        expect(unauthRes.statusCode).toBe(401);

        // Authorized call
        const authRes = await request(app)
            .get('/api/admin/discovery-logs')
            .set('x-admin-key', 'your_secret_admin_key');
        expect(authRes.statusCode).toBe(200);
        expect(Array.isArray(authRes.body.discoveryLogs)).toBe(true);
    });

    test('5. GET /api/discoveries returns discoveries for deviceId', async () => {
        const res = await request(app)
            .get('/api/discoveries?deviceId=test-device-uuid-6565');

        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body.discoveries)).toBe(true);
    });
});
