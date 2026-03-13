const Coupon = require('../models/Coupon');
const CouponRedemption = require('../models/CouponRedemption');

const validateCouponForUser = async ({ code, userId, planCode, baseAmountPaise }) => {
    const normalizedCode = String(code || '').trim().toUpperCase();
    if (!normalizedCode) {
        return {
            coupon: null,
            discountAmountPaise: 0,
            finalAmountPaise: baseAmountPaise
        };
    }

    const coupon = await Coupon.findOne({ code: normalizedCode, isActive: true });
    if (!coupon) throw new Error('Invalid coupon code');

    const now = new Date();
    if (coupon.validFrom > now || coupon.validTill < now) {
        throw new Error('Coupon is not valid at this time');
    }

    if (!coupon.applicablePlanCodes.includes(planCode)) {
        throw new Error('Coupon is not applicable for this plan');
    }

    if ((coupon.currentUses || 0) >= coupon.maxTotalUses) {
        throw new Error('Coupon usage limit reached');
    }

    if ((coupon.minOrderAmountPaise || 0) > baseAmountPaise) {
        throw new Error('Minimum order amount not met for this coupon');
    }

    const userUses = await CouponRedemption.countDocuments({
        couponId: coupon._id,
        userId
    });

    if (userUses >= (coupon.maxUsesPerUser || 1)) {
        throw new Error('Coupon already used by this user');
    }

    const computedDiscount = Math.floor((baseAmountPaise * coupon.discountPercent) / 100);
    const discountAmountPaise = Math.min(computedDiscount, coupon.maxDiscountPaise);
    const finalAmountPaise = Math.max(0, baseAmountPaise - discountAmountPaise);

    return {
        coupon,
        discountAmountPaise,
        finalAmountPaise
    };
};

const finalizeCouponRedemption = async ({ couponCode, userId, paymentId, discountAmountPaise }) => {
    if (!couponCode || discountAmountPaise <= 0) return null;

    const coupon = await Coupon.findOne({ code: String(couponCode).toUpperCase() });
    if (!coupon) return null;

    const existing = await CouponRedemption.findOne({ paymentId });
    if (existing) return existing;

    const redemption = await CouponRedemption.create({
        couponId: coupon._id,
        userId,
        paymentId,
        discountAmountPaise
    });

    await Coupon.updateOne({ _id: coupon._id }, { $inc: { currentUses: 1 } });
    return redemption;
};

module.exports = {
    validateCouponForUser,
    finalizeCouponRedemption
};
