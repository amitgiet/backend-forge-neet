const mongoose = require('mongoose');

const CouponSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true
        },
        discountPercent: {
            type: Number,
            required: true,
            min: 1,
            max: 100
        },
        maxDiscountPaise: {
            type: Number,
            required: true,
            min: 1
        },
        minOrderAmountPaise: {
            type: Number,
            default: 0
        },
        validFrom: {
            type: Date,
            required: true
        },
        validTill: {
            type: Date,
            required: true
        },
        maxTotalUses: {
            type: Number,
            required: true,
            min: 1
        },
        maxUsesPerUser: {
            type: Number,
            default: 1,
            min: 1
        },
        currentUses: {
            type: Number,
            default: 0
        },
        isActive: {
            type: Boolean,
            default: true
        },
        applicablePlanCodes: {
            type: [String],
            default: ['PRO_MONTHLY']
        }
    },
    {
        timestamps: true
    }
);

CouponSchema.index({ code: 1, isActive: 1 });

module.exports = mongoose.model('Coupon', CouponSchema);
