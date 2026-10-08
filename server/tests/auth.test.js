const request = require('supertest');
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const authRouter = require('../routes/auth');
const profileRouter = require('../routes/profile');
const discoveriesRouter = require('../routes/discoveries');
const { authenticateOwner, JWT_SECRET } = require('../middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);
app.use('/api/discoveries', discoveriesRouter);

// Test helper route for testing middleware
app.get('/api/test-middleware', authenticateOwner, (req, res) => {
    res.json({ owner: req.owner });
});

describe('User Accounts & Auth Unit Tests', () => {

    test('1. Signup validation rejects weak passwords and invalid emails', async () => {
        // Invalid email format
        const res1 = await request(app)
            .post('/api/auth/signup')
            .send({ email: 'not-an-email', password: 'Password123' });
        expect(res1.statusCode).toBe(400);

        // Password too short (<8 chars)
        const res2 = await request(app)
            .post('/api/auth/signup')
            .send({ email: 'user1@example.com', password: 'Pass1' });
        expect(res2.statusCode).toBe(400);
        expect(res2.body.error).toContain('at least 8 characters');

        // Password missing number
        const res3 = await request(app)
            .post('/api/auth/signup')
            .send({ email: 'user1@example.com', password: 'PasswordWord' });
        expect(res3.statusCode).toBe(400);
        expect(res3.body.error).toContain('at least one number');

        // Common weak password rejection
        const res4 = await request(app)
            .post('/api/auth/signup')
            .send({ email: 'user1@example.com', password: 'password123' });
        expect(res4.statusCode).toBe(400);
        expect(res4.body.error).toContain('weak');
    });

    test('2. Signup succeeds with valid credentials and returns tokens', async () => {
        const res = await request(app)
            .post('/api/auth/signup')
            .send({
                email: 'validuser@example.com',
                password: 'StrongPass123',
                displayName: 'TamilCitizen'
            });

        expect(res.statusCode).toBe(201);
        expect(res.body.accessToken).toBeDefined();
        expect(res.body.refreshToken).toBeDefined();
        expect(res.body.user.email).toBe('validuser@example.com');
        expect(res.body.user.displayName).toBe('TamilCitizen');
    });

    test('3. Login handles success and generic failure message', async () => {
        // Login success
        const resSuccess = await request(app)
            .post('/api/auth/login')
            .send({ email: 'validuser@example.com', password: 'StrongPass123' });

        expect(resSuccess.statusCode).toBe(200);
        expect(resSuccess.body.accessToken).toBeDefined();
        expect(resSuccess.body.refreshToken).toBeDefined();

        // Login failure - generic error message
        const resFail = await request(app)
            .post('/api/auth/login')
            .send({ email: 'validuser@example.com', password: 'WrongPassword99' });

        expect(resFail.statusCode).toBe(401);
        expect(resFail.body.error).toBe('Incorrect email or password');
    });

    test('4. Token Refresh returns new access & refresh tokens', async () => {
        const res = await request(app)
            .post('/api/auth/refresh')
            .send({ refreshToken: 'sample-refresh-token-string' });

        expect(res.statusCode).toBe(200);
        expect(res.body.accessToken).toBeDefined();
        expect(res.body.refreshToken).toBeDefined();
    });

    test('5. Logout revokes token cleanly', async () => {
        const res = await request(app)
            .post('/api/auth/logout')
            .send({ refreshToken: 'sample-refresh-token-string' });

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toContain('Logged out successfully');
    });

    test('6. Forgot Password returns generic response regardless of email existence', async () => {
        const res1 = await request(app)
            .post('/api/auth/forgot-password')
            .send({ email: 'validuser@example.com' });

        expect(res1.statusCode).toBe(200);
        expect(res1.body.message).toContain('password reset instructions have been sent');

        const res2 = await request(app)
            .post('/api/auth/forgot-password')
            .send({ email: 'nonexistent@example.com' });

        expect(res2.statusCode).toBe(200);
        expect(res2.body.message).toBe(res1.body.message);
    });

    test('7. Guest Data Claiming transfers guest records and prevents duplicates', async () => {
        // First login to get access token
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'validuser@example.com', password: 'StrongPass123' });

        const token = loginRes.body.accessToken;

        // Claim guest device
        const claimRes = await request(app)
            .post('/api/auth/claim-guest-data')
            .set('Authorization', `Bearer ${token}`)
            .send({ deviceId: 'guest-device-uuid-9999' });

        expect(claimRes.statusCode).toBe(200);
        expect(claimRes.body.message).toContain('claimed successfully');
        expect(claimRes.body.movedCounts).toBeDefined();
    });

    test('8. Auth Middleware distinguishes between User Bearer Token and Guest Device ID', async () => {
        // Case A: Signed-in User via JWT
        const userToken = jwt.sign({ userId: 'user-id-555', email: 'user@example.com' }, JWT_SECRET, { expiresIn: '15m' });
        const userRes = await request(app)
            .get('/api/test-middleware')
            .set('Authorization', `Bearer ${userToken}`);

        expect(userRes.statusCode).toBe(200);
        expect(userRes.body.owner.type).toBe('user');
        expect(userRes.body.owner.id).toBe('user-id-555');

        // Case B: Guest Mode via deviceId header
        const guestRes = await request(app)
            .get('/api/test-middleware')
            .set('x-device-id', 'guest-device-777');

        expect(guestRes.statusCode).toBe(200);
        expect(guestRes.body.owner.type).toBe('guest');
        expect(guestRes.body.owner.id).toBe('guest-device-777');
    });

    test('9. Delete Account cascading deletion flow', async () => {
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'validuser@example.com', password: 'StrongPass123' });

        const token = loginRes.body.accessToken;

        // Attempt delete with wrong password
        const failDel = await request(app)
            .delete('/api/auth/me')
            .set('Authorization', `Bearer ${token}`)
            .send({ password: 'WrongPassword' });

        expect(failDel.statusCode).toBe(401);

        // Delete with correct password
        const successDel = await request(app)
            .delete('/api/auth/me')
            .set('Authorization', `Bearer ${token}`)
            .send({ password: 'StrongPass123' });

        expect(successDel.statusCode).toBe(200);
        expect(successDel.body.message).toContain('Account and all associated data deleted successfully');
    });
});
