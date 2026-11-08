const { requireActivePlan } = require('../../src/middleware/entitlement');

describe('requireActivePlan Entitlement Middleware', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
        req = {
            user: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        next = jest.fn();
    });

    test('permits access to users with active unexpired Pro plan', () => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 30);

        req.user = {
            _id: 'u1',
            subscription: {
                plan: 'pro',
                status: 'active',
                currentPeriodEnd: futureDate
            }
        };

        const middleware = requireActivePlan('pro', 'ultimate');
        middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    test('permits access to users with active unexpired Ultimate plan', () => {
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1);

        req.user = {
            _id: 'u2',
            subscription: {
                plan: 'ultimate',
                status: 'active',
                currentPeriodEnd: futureDate
            }
        };

        const middleware = requireActivePlan('pro', 'ultimate');
        middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    test('blocks free tier users with HTTP 403 UPGRADE_REQUIRED', () => {
        req.user = {
            _id: 'u3',
            subscription: {
                plan: 'free',
                status: 'active'
            }
        };

        const middleware = requireActivePlan('pro', 'ultimate');
        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                code: 'UPGRADE_REQUIRED'
            })
        );
    });

    test('blocks expired Pro plan with HTTP 403 SUBSCRIPTION_EXPIRED', () => {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 1);

        req.user = {
            _id: 'u4',
            subscription: {
                plan: 'pro',
                status: 'active',
                currentPeriodEnd: pastDate
            }
        };

        const middleware = requireActivePlan('pro', 'ultimate');
        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                code: 'SUBSCRIPTION_EXPIRED'
            })
        );
    });

    test('blocks users with missing subscription object with HTTP 403 UPGRADE_REQUIRED', () => {
        req.user = { _id: 'u5' };

        const middleware = requireActivePlan('pro');
        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                code: 'UPGRADE_REQUIRED'
            })
        );
    });

    test('defaults to checking plan !== "free" when no explicit plans provided', () => {
        const futureDate = new Date(Date.now() + 86400000);
        req.user = {
            subscription: {
                plan: 'pro',
                currentPeriodEnd: futureDate
            }
        };

        const defaultMiddleware = requireActivePlan();
        defaultMiddleware(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);

        // Free plan should be rejected
        next.mockClear();
        req.user.subscription.plan = 'free';
        defaultMiddleware(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });
});
