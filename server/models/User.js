const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: { 
        type: String, 
        required: true, 
        unique: true, 
        lowercase: true, 
        trim: true 
    },
    passwordHash: { 
        type: String, 
        required: true 
    },
    displayName: { 
        type: String, 
        default: '' 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    lastLoginAt: { 
        type: Date 
    },
    emailVerified: { 
        type: Boolean, 
        default: false 
    },
    failedLoginCount: { 
        type: Number, 
        default: 0 
    },
    lockedUntil: { 
        type: Date, 
        default: null 
    },
    passwordResetTokenHash: { 
        type: String, 
        default: null 
    },
    passwordResetExpires: { 
        type: Date, 
        default: null 
    },
    claimedDeviceIds: [{ 
        type: String 
    }],
    fullProfile: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
