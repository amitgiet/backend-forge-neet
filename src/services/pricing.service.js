const { BILLING_PLANS } = require('../config/billingConfig');
const { validateCouponForUser } = require('./coupon.service');

const getPlanPricing = (planCode) => {
    const plan = BILLING_PLANS[planCode];
    if (!plan) throw new Error('Invalid plan code');
    return plan;
};

const getPricingBreakdown = async ({ planCode, couponCode, userId }) => {
    const plan = getPlanPricing(planCode);
    const baseAmountPaise = plan.amountPaise;

    const couponResult = await validateCouponForUser({
        code: couponCode,
        userId,
        planCode,
        baseAmountPaise
    });

    return {
        plan,
        coupon: couponResult.coupon,
        baseAmountPaise,
        discountAmountPaise: couponResult.discountAmountPaise,
        finalAmountPaise: couponResult.finalAmountPaise
    };
};

module.exports = {
    getPlanPricing,
    getPricingBreakdown
};
