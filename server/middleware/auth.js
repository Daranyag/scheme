const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your_default_jwt_secret_key_change_in_production';

/**
 * Middleware that accepts either a valid Bearer JWT token (user mode)
 * or a deviceId (guest mode), and populates req.owner = { type: 'user' | 'guest', id: string }.
 */
async function authenticateOwner(req, res, next) {
    req.owner = null;
    req.user = null;

    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded && decoded.userId) {
                req.owner = { type: 'user', id: decoded.userId };
                if (mongoose.connection.readyState === 1) {
                    req.user = await User.findById(decoded.userId).select('-passwordHash');
                } else {
                    req.user = { _id: decoded.userId, email: decoded.email || 'user@example.com' };
                }
                return next();
            }
        } catch (err) {
            // Invalid/expired access token
        }
    }

    // Guest Fallback: check deviceId in headers, query, or body
    const deviceId = req.headers['x-device-id'] || req.query.deviceId || (req.body && req.body.deviceId);

    if (deviceId) {
        req.owner = { type: 'guest', id: String(deviceId) };
        return next();
    }

    // If neither is provided, mark as guest with null id
    req.owner = { type: 'guest', id: null };
    next();
}

/**
 * Strict middleware for user-only endpoints.
 */
function requireUser(req, res, next) {
    if (!req.owner || req.owner.type !== 'user' || !req.owner.id) {
        return res.status(401).json({ error: 'Unauthorized. User authentication required.' });
    }
    next();
}

module.exports = {
    authenticateOwner,
    requireUser,
    JWT_SECRET
};
