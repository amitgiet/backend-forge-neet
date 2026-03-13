const crypto = require('crypto');
const { verifyCheckoutSignature, verifyWebhookSignature } = require('../src/services/razorpay.service');

describe('razorpay.service', () => {
    beforeEach(() => {
        process.env.RAZORPAY_KEY_SECRET = 'test_secret';
        process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_secret';
    });

    test('verifies checkout signature correctly', () => {
        const orderId = 'order_123';
        const paymentId = 'pay_123';
        const validSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${orderId}|${paymentId}`)
            .digest('hex');

        const isValid = verifyCheckoutSignature({
            orderId,
            paymentId,
            signature: validSignature
        });

        expect(isValid).toBe(true);
    });

    test('verifies webhook signature correctly', () => {
        const rawBody = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
        const validSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
            .update(rawBody)
            .digest('hex');

        const isValid = verifyWebhookSignature({
            rawBody,
            signature: validSignature
        });

        expect(isValid).toBe(true);
    });
});
