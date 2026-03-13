const mongoose = require('mongoose');

const ReferralSchema = new mongoose.Schema(
    {
        ownerUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true
        },
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true
        },
        isActive: {
            type: Boolean,
            default: true
        },
        totalConversions: {
            type: Number,
            default: 0
        },
        totalRewardDaysGranted: {
            type: Number,
            default: 0
        },
        totalRewardDaysRevoked: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model('Referral', ReferralSchema);
