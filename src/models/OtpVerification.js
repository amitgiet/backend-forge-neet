const mongoose = require('mongoose');

const OtpVerificationSchema = new mongoose.Schema(
    {
        phone: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        otpHash: {
            type: String,
            default: null
        },
        expiresAt: {
            type: Date,
            default: null
        },
        attempts: {
            type: Number,
            default: 0
        },
        requestCount: {
            type: Number,
            default: 0
        },
        requestWindowStart: {
            type: Date,
            default: null
        },
        lastSentAt: {
            type: Date,
            default: null
        },
        isVerified: {
            type: Boolean,
            default: false
        },
        verifiedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

// Auto-delete stale OTP records after 24 hours.
OtpVerificationSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

module.exports = mongoose.model('OtpVerification', OtpVerificationSchema);
