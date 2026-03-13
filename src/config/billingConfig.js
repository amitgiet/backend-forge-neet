const BILLING_PLANS = {
    PRO_MONTHLY: {
        planCode: 'PRO_MONTHLY',
        displayName: 'Pro Monthly',
        amountPaise: parseInt(process.env.PRO_MONTHLY_PRICE_PAISE, 10) || 14900,
        validityDays: 30
    }
};

const REFERRAL_REWARD_DAYS = parseInt(process.env.REFERRAL_REWARD_DAYS, 10) || 7;

module.exports = {
    BILLING_PLANS,
    REFERRAL_REWARD_DAYS
};
