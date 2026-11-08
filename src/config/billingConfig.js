const BILLING_PLANS = {
    PRO_MONTHLY: {
        planCode: 'PRO_MONTHLY',
        displayName: 'Pro Monthly',
        amountPaise: parseInt(process.env.PRO_MONTHLY_PRICE_PAISE, 10) || 14900,
        validityDays: 30
    },
    crash_90d: {
        planCode: 'crash_90d',
        displayName: '90-Day NEET Crash Pass',
        amountPaise: 39900,
        validityDays: 90
    },
    neet_2026_1y: {
        planCode: 'neet_2026_1y',
        displayName: 'NEET 2026 Season Pass',
        amountPaise: 149900,
        validityDays: 365
    },
    dropper_2y: {
        planCode: 'dropper_2y',
        displayName: 'Dropper 2-Year Full Pass',
        amountPaise: 249900,
        validityDays: 730
    }
};

const REFERRAL_REWARD_DAYS = parseInt(process.env.REFERRAL_REWARD_DAYS, 10) || 7;

module.exports = {
    BILLING_PLANS,
    REFERRAL_REWARD_DAYS
};
