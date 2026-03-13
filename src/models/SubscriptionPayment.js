const mongoose = require('mongoose');

const SubscriptionPaymentSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        planCode: {
            type: String,
            enum: ['PRO_MONTHLY'],
            required: true
        },
        baseAmountPaise: {
            type: Number,
            required: true
        },
        discountAmountPaise: {
            type: Number,
            default: 0
        },
        finalAmountPaise: {
            type: Number,
            required: true
        },
        currency: {
            type: String,
            default: 'INR'
        },
        couponCode: {
            type: String,
            default: null
        },
        referralCodeUsed: {
            type: String,
            default: null
        },
        referredByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        razorpayOrderId: {
            type: String,
            required: true,
            unique: true
        },
        razorpayPaymentId: {
            type: String,
            default: null,
            sparse: true,
            unique: true
        },
        status: {
            type: String,
            enum: ['created', 'pending_webhook_confirmation', 'paid', 'failed', 'refunded'],
            default: 'created',
            index: true
        },
        paidAt: {
            type: Date,
            default: null
        },
        refundedAt: {
            type: Date,
            default: null
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        }
    },
    {
        timestamps: true
    }
);

SubscriptionPaymentSchema.index({ userId: 1, createdAt: -1 });
SubscriptionPaymentSchema.index({ razorpayOrderId: 1, status: 1 });

module.exports = mongoose.model('SubscriptionPayment', SubscriptionPaymentSchema);
