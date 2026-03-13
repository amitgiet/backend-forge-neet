const User = require('../models/User');

const DAY_MS = 24 * 60 * 60 * 1000;

const activateProForDays = async (userId, days, paymentId) => {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found for subscription activation');

    const now = new Date();
    const currentEnd = user.subscription?.currentPeriodEnd
        ? new Date(user.subscription.currentPeriodEnd)
        : null;

    const startBase = currentEnd && currentEnd > now ? currentEnd : now;
    const nextEnd = new Date(startBase.getTime() + days * DAY_MS);

    user.subscription.plan = 'pro';
    user.subscription.status = 'active';
    user.subscription.currentPeriodStart = startBase;
    user.subscription.currentPeriodEnd = nextEnd;
    user.subscription.lastPaymentId = paymentId;

    await user.save({ validateBeforeSave: false });
    return user.subscription;
};

const revokeDays = async (userId, days) => {
    const user = await User.findById(userId);
    if (!user) return null;

    if (!user.subscription?.currentPeriodEnd) {
        return user.subscription;
    }

    const now = new Date();
    const currentEnd = new Date(user.subscription.currentPeriodEnd);
    const reducedEnd = new Date(currentEnd.getTime() - days * DAY_MS);
    user.subscription.currentPeriodEnd = reducedEnd;

    if (reducedEnd <= now) {
        user.subscription.plan = 'free';
        user.subscription.status = 'expired';
    }

    await user.save({ validateBeforeSave: false });
    return user.subscription;
};

const downgradeIfExpired = async (userId) => {
    const user = await User.findById(userId);
    if (!user) return null;

    const now = new Date();
    const isExpired =
        user.subscription?.plan === 'pro' &&
        user.subscription?.currentPeriodEnd &&
        new Date(user.subscription.currentPeriodEnd) <= now;

    if (isExpired) {
        user.subscription.plan = 'free';
        user.subscription.status = 'expired';
        await user.save({ validateBeforeSave: false });
    }

    return user.subscription;
};

module.exports = {
    activateProForDays,
    revokeDays,
    downgradeIfExpired
};
