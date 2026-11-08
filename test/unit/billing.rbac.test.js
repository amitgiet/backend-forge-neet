// Mock protect to pass through req.user while using the real authorize implementation
jest.mock('../../src/middleware/auth', () => {
    const actual = jest.requireActual('../../src/middleware/auth');
    return {
        protect: (req, res, next) => next(),
        authorize: actual.authorize
    };
});

// Mock billing controllers
jest.mock('../../src/controllers/billingController', () => ({
    initiateCheckout: (req, res) => res.json({ success: true, action: 'initiateCheckout' }),
    createOrder: (req, res) => res.json({ success: true, action: 'createOrder' }),
    verifyCheckout: (req, res) => res.json({ success: true, action: 'verifyCheckout' }),
    verifyClientPayment: (req, res) => res.json({ success: true, action: 'verifyClientPayment' }),
    validateCoupon: (req, res) => res.json({ success: true, action: 'validateCoupon' }),
    getSubscriptionStatus: (req, res) => res.json({ success: true, action: 'getSubscriptionStatus' }),
    razorpayWebhook: (req, res) => res.json({ success: true, action: 'razorpayWebhook' }),
    createCoupon: (req, res) => res.json({ success: true, action: 'createCoupon' }),
    updateCoupon: (req, res) => res.json({ success: true, action: 'updateCoupon' }),
    listCoupons: (req, res) => res.json({ success: true, action: 'listCoupons' }),
    disableCoupon: (req, res) => res.json({ success: true, action: 'disableCoupon' }),
    listAllPayments: (req, res) => res.json({ success: true, action: 'listAllPayments' })
}));

const express = require('express');
const request = require('supertest');
const billingRouter = require('../../src/routes/billingRoutes');


describe('Billing RBAC Authorization (P0 Fix)', () => {
    let app;
    let currentUser;

    beforeEach(() => {
        app = express();
        app.use(express.json());

        // Simulate protect middleware setting req.user
        app.use((req, res, next) => {
            req.user = currentUser;
            next();
        });

        app.use('/billing', billingRouter);
    });

    test('Ultimate plan students attempting coupon admin endpoints receive HTTP 403 Forbidden', async () => {
        currentUser = {
            _id: 'user_ultimate_1',
            role: 'student',
            subscription: { plan: 'ultimate', status: 'active' }
        };

        const resCreate = await request(app).post('/billing/admin/coupons').send({ code: 'HACK50' });
        expect(resCreate.status).toBe(403);
        expect(resCreate.body.success).toBe(false);

        const resList = await request(app).get('/billing/admin/coupons');
        expect(resList.status).toBe(403);

        const resDisable = await request(app).post('/billing/admin/coupons/c1/disable');
        expect(resDisable.status).toBe(403);

        const resPayments = await request(app).get('/billing/admin/payments');
        expect(resPayments.status).toBe(403);
    });

    test('Pro plan students attempting coupon admin endpoints receive HTTP 403 Forbidden', async () => {
        currentUser = {
            _id: 'user_pro_1',
            role: 'student',
            subscription: { plan: 'pro', status: 'active' }
        };

        const res = await request(app).get('/billing/admin/coupons');
        expect(res.status).toBe(403);
    });

    test('Free plan students attempting coupon admin endpoints receive HTTP 403 Forbidden', async () => {
        currentUser = {
            _id: 'user_free_1',
            role: 'student',
            subscription: { plan: 'free', status: 'active' }
        };

        const res = await request(app).get('/billing/admin/coupons');
        expect(res.status).toBe(403);
    });

    test('Only users with role admin can access /admin/coupons and /admin/payments', async () => {
        currentUser = {
            _id: 'admin_1',
            role: 'admin',
            subscription: { plan: 'free' }
        };

        const resCreate = await request(app).post('/billing/admin/coupons').send({ code: 'ADMIN100' });
        expect(resCreate.status).toBe(200);
        expect(resCreate.body.action).toBe('createCoupon');

        const resList = await request(app).get('/billing/admin/coupons');
        expect(resList.status).toBe(200);
        expect(resList.body.action).toBe('listCoupons');

        const resPayments = await request(app).get('/billing/admin/payments');
        expect(resPayments.status).toBe(200);
        expect(resPayments.body.action).toBe('listAllPayments');
    });
});
