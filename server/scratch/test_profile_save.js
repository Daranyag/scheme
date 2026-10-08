const axios = require('axios');

async function run() {
    try {
        // 1. Sign up a test user
        const email = 'test_logout_' + Date.now() + '@example.com';
        const password = 'password123';
        const signupRes = await axios.post('http://localhost:3000/api/auth/signup', { email, password, displayName: 'Test User' });
        const token = signupRes.data.accessToken;

        console.log('Signed up, token:', token.substring(0, 20) + '...');

        // 2. Save full profile
        const fakeProfile = { age: 35, gender: 'F', district: 'Chennai', family_income: 150000 };
        await axios.post('http://localhost:3000/api/profile/full', { fullProfile: fakeProfile }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Saved full profile successfully.');

        // 3. Fetch full profile
        const fetchRes = await axios.get('http://localhost:3000/api/profile/full', {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Fetched full profile:', fetchRes.data.fullProfile);

    } catch (e) {
        console.error('Error:', e.response ? e.response.data : e.message);
    }
}

run();
