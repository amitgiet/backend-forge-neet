const mongoose = require('mongoose');
const User = require('../../src/models/User');
const SubscriptionPayment = require('../../src/models/SubscriptionPayment');
const Coupon = require('../../src/models/Coupon');
const webhookProcessor = require('../../src/services/billing/webhookProcessor.service');
const CronService = require('../../src/services/cronService');

jest.mock('../../src/models/User');
jest.mock('../../src/models/SubscriptionPayment');
jest.mock('../../src/models/Coupon');

describe('Billing Integration Test Suite', () => {
    let mockSession;

    beforeEach(() => {
        jest.clearAllMocks();

        mockSession = {
            withTransaction: jest.fn(async (callback) => {
                return await callback();
            }),
            endSession: jest.fn()
        };

        mongoose.startSession = jest.fn().mockResolvedValue(mockSession);
    });

    describe('ACID Webhook Processor & Idempotency', () => {
        test('processes captured payment atomically, records payment and upgrades user', async () => {
            const queryChain = {
                session: jest.fn().mockResolvedValue(null)
            };
            SubscriptionPayment.findOne.mockReturnValue(queryChain);
            SubscriptionPayment.create.mockResolvedValue([{}]);

            const mockUpdatedUser = {
                _id: 'user_123',
                subscription: {
                    plan: 'pro',
                    status: 'active'
                }
            };
            User.findByIdAndUpdate.mockResolvedValue(mockUpdatedUser);
            Coupon.findOneAndUpdate.mockResolvedValue({ code: 'NEET50' });

            const payload = {
                id: 'pay_capture_999',
                order_id: 'order_test_999',
                amount: 149900,
                notes: {
                    userId: 'user_123',
                    planId: 'neet_2026_1y',
                    couponCode: 'NEET50',
                    durationDays: 365
                }
            };

            const result = await webhookProcessor.processCapturedPayment(payload);

            expect(mockSession.withTransaction).toHaveBeenCalled();
            expect(SubscriptionPayment.create).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        paymentId: 'pay_capture_999',
                        userId: 'user_123',
                        amountPaise: 149900,
                        status: 'captured'
                    })
                ]),
                { session: mockSession }
            );
            expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
                'user_123',
                expect.objectContaining({
                    $set: expect.objectContaining({
                        'subscription.plan': 'pro',
                        'subscription.status': 'active'
                    })
                }),
                expect.objectContaining({ session: mockSession, new: true })
            );
            expect(Coupon.findOneAndUpdate).toHaveBeenCalledWith(
                { code: 'NEET50' },
                { $inc: { timesUsed: 1, currentUses: 1 } },
                { session: mockSession }
            );
            expect(result.status).toBe('success');
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('handles duplicate webhooks idempotently without duplicate fulfillment', async () => {
            const existingPayment = {
                paymentId: 'pay_duplicate_123',
                status: 'captured'
            };
            const queryChain = {
                session: jest.fn().mockResolvedValue(existingPayment)
            };
            SubscriptionPayment.findOne.mockReturnValue(queryChain);

            const payload = {
                id: 'pay_duplicate_123',
                order_id: 'order_dup_123',
                amount: 149900,
                notes: {
                    userId: 'user_123',
                    planId: 'neet_2026_1y'
                }
            };

            const result = await webhookProcessor.processCapturedPayment(payload);

            expect(result.status).toBe('already_processed');
            expect(SubscriptionPayment.create).not.toHaveBeenCalled();
            expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });
    });

    describe('Cron Subscription Expiry Sweeper', () => {
        test('reverts expired paid subscriptions cleanly to free plan in bulk', async () => {
            User.updateMany.mockResolvedValue({
                acknowledged: true,
                modifiedCount: 12
            });

            const result = await CronService.sweepExpiredSubscriptions();

            expect(User.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    'subscription.plan': { $ne: 'free' }
                }),
                expect.objectContaining({
                    $set: {
                        'subscription.plan': 'free',
                        'subscription.status': 'expired'
                    }
                })
            );
            expect(result.modifiedCount).toBe(12);
        });
    });
});
