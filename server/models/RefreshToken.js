const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    tokenHash: { 
        type: String, 
        required: true, 
        index: true 
    },
    deviceInfo: { 
        type: String, 
        default: 'unknown' 
    },
    expiresAt: { 
        type: Date, 
        required: true 
    },
    revokedAt: { 
        type: Date, 
        default: null 
    }
}, { timestamps: true });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
