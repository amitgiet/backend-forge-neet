const mongoose = require('mongoose');

const ReferralRewardSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        rewardDays: {
            type: Number,
            default: 7
        },
        status: {
            type: String,
            enum: ['pending', 'granted', 'revoked'],
            default: 'granted'
        },
        paymentId: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.models.ReferralReward || mongoose.model('ReferralReward', ReferralRewardSchema);
