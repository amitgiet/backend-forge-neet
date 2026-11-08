const crypto = require('crypto');
const razorpayService = require('../../src/services/billing/razorpay.service');

describe('RazorpayService Cryptographic Verification', () => {
    beforeEach(() => {
        process.env.RAZORPAY_KEY_ID = 'rzp_test_key123';
        process.env.RAZORPAY_KEY_SECRET = 'secret_test_456';
        process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook_sec_789';

        razorpayService.keyId = process.env.RAZORPAY_KEY_ID;
        razorpayService.keySecret = process.env.RAZORPAY_KEY_SECRET;
        razorpayService.webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    });

    test('createOrder returns keyId, orderId, amount, and currency in paise', async () => {
        razorpayService.client = {
            orders: {
                create: jest.fn().mockResolvedValue({
                    id: 'order_test_101',
                    amount: 14900,
                    currency: 'INR'
                })
            }
        };

        const result = await razorpayService.createOrder({
            amountPaise: 14900,
            receipt: 'rcpt_1',
            notes: { planId: 'neet_2026_1y' }
        });

        expect(result.keyId).toBe('rzp_test_key123');
        expect(result.orderId).toBe('order_test_101');
        expect(result.amount).toBe(14900);
        expect(result.currency).toBe('INR');
    });

    test('verifyWebhookSignature validates authentic Razorpay signatures', () => {
        const rawBody = Buffer.from(JSON.stringify({ event: 'payment.captured', id: 'pay_123' }));
        const validSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
            .update(rawBody)
            .digest('hex');

        const isValid = razorpayService.verifyWebhookSignature(rawBody, validSignature);
        expect(isValid).toBe(true);
    });

    test('verifyWebhookSignature rejects tampered payload or signature in constant time', () => {
        const rawBody = Buffer.from(JSON.stringify({ event: 'payment.captured', id: 'pay_123' }));
        const validSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
            .update(rawBody)
            .digest('hex');

        const tamperedSignature = validSignature.slice(0, -2) + 'aa';
        expect(razorpayService.verifyWebhookSignature(rawBody, tamperedSignature)).toBe(false);

        // Different length buffer
        expect(razorpayService.verifyWebhookSignature(rawBody, 'short_sig')).toBe(false);

        // Tampered body
        const tamperedBody = Buffer.from(JSON.stringify({ event: 'payment.captured', id: 'pay_999' }));
        expect(razorpayService.verifyWebhookSignature(tamperedBody, validSignature)).toBe(false);

        // Missing signature or secret
        expect(razorpayService.verifyWebhookSignature(rawBody, '')).toBe(false);
    });

    test('verifyCheckoutSignature validates authentic signatures and rejects forged ones', () => {
        const orderId = 'order_abc123';
        const paymentId = 'pay_xyz789';
        const payload = `${orderId}|${paymentId}`;
        const validSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(payload)
            .digest('hex');

        expect(razorpayService.verifyCheckoutSignature({ orderId, paymentId, signature: validSignature })).toBe(true);

        const forgedSignature = validSignature.replace(/[a-f0-9]/, 'x');
        expect(razorpayService.verifyCheckoutSignature({ orderId, paymentId, signature: forgedSignature })).toBe(false);

        expect(razorpayService.verifyCheckoutSignature({ orderId, paymentId: 'other_pay', signature: validSignature })).toBe(false);
    });
});
