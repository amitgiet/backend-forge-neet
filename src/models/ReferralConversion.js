const mongoose = require('mongoose');

const ReferralConversionSchema = new mongoose.Schema(
    {
        referrerUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        referredUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        paymentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SubscriptionPayment',
            required: true,
            unique: true
        },
        rewardDaysGranted: {
            type: Number,
            default: 7
        },
        rewardDaysRevoked: {
            type: Number,
            default: 0
        },
        status: {
            type: String,
            enum: ['granted', 'revoked'],
            default: 'granted'
        }
    },
    {
        timestamps: true
    }
);

ReferralConversionSchema.index({ referredUserId: 1 }, { unique: true });

module.exports = mongoose.model('ReferralConversion', ReferralConversionSchema);
