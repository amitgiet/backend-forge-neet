exports.requireActivePlan = (...allowedPlans) => {
    return (req, res, next) => {
        const sub = req.user?.subscription;

        if (!sub || (allowedPlans.length > 0 ? !allowedPlans.includes(sub.plan) : sub.plan === 'free')) {
            return res.status(403).json({
                success: false,
                code: 'UPGRADE_REQUIRED',
                error: 'This feature requires a NEETForge Pro Season Pass.'
            });
        }

        const isExpired = !sub.currentPeriodEnd || new Date(sub.currentPeriodEnd).getTime() <= Date.now();

        if (isExpired) {
            return res.status(403).json({
                success: false,
                code: 'SUBSCRIPTION_EXPIRED',
                error: 'Your Season Pass has expired. Please renew to continue accessing premium features.'
            });
        }

        next();
    };
};
