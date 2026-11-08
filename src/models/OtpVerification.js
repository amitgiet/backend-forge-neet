const mongoose = require('mongoose');

const OtpVerificationSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: true,
        match: [/^[0-9]{10}$/, 'Must be a valid 10-digit phone number'],
        index: true
    },
    otpHash: {
        type: String,
        required: true
    },
    attempts: {
        type: Number,
        default: 0,
        max: 3
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: '5m' }
    },
    lastSentAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

OtpVerificationSchema.index({ phone: 1, isVerified: 1 });

module.exports = mongoose.model('OtpVerification', OtpVerificationSchema);
