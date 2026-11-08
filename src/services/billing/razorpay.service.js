const Razorpay = require('razorpay');
const crypto = require('crypto');

class RazorpayService {
    constructor() {
        this.keyId = process.env.RAZORPAY_KEY_ID;
        this.keySecret = process.env.RAZORPAY_KEY_SECRET;
        this.webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

        if (this.keyId && this.keySecret) {
            this.client = new Razorpay({
                key_id: this.keyId,
                key_secret: this.keySecret
            });
        }
    }

    getClient() {
        if (!this.client) {
            const key_id = this.keyId || process.env.RAZORPAY_KEY_ID;
            const key_secret = this.keySecret || process.env.RAZORPAY_KEY_SECRET;
            if (!key_id || !key_secret) {
                throw new Error('Razorpay credentials are not configured');
            }
            this.client = new Razorpay({ key_id, key_secret });
        }
        return this.client;
    }

    /**
     * Creates an order with Razorpay in INR paise.
     */
    async createOrder({ amountPaise, receipt, notes = {} }) {
        const client = this.getClient();
        const options = {
            amount: amountPaise,
            currency: 'INR',
            receipt,
            notes
        };

        const order = await client.orders.create(options);
        return {
            keyId: this.keyId || process.env.RAZORPAY_KEY_ID,
            orderId: order.id,
            id: order.id,
            amount: order.amount,
            currency: order.currency
        };
    }

    /**
     * Validates Checkout signature using constant-time comparison.
     */
    verifyCheckoutSignature(params) {
        const { orderId, paymentId, signature } = params;
        const secret = this.keySecret || process.env.RAZORPAY_KEY_SECRET;
        if (!signature || !secret || !orderId || !paymentId) return false;

        const payload = `${orderId}|${paymentId}`;
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');

        const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');
        const receivedBuffer = Buffer.from(signature, 'utf-8');

        if (expectedBuffer.length !== receivedBuffer.length) {
            return false;
        }

        return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    }

    /**
     * Validates Webhook signature using constant-time comparison.
     */
    verifyWebhookSignature(rawBodyOrParams, receivedSignature) {
        let rawBody = rawBodyOrParams;
        let signature = receivedSignature;

        if (typeof rawBodyOrParams === 'object' && !Buffer.isBuffer(rawBodyOrParams) && rawBodyOrParams.rawBody) {
            rawBody = rawBodyOrParams.rawBody;
            signature = rawBodyOrParams.signature;
        }

        const secret = this.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!signature || !secret || !rawBody) return false;

        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(rawBody)
            .digest('hex');

        const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');
        const receivedBuffer = Buffer.from(signature, 'utf-8');

        if (expectedBuffer.length !== receivedBuffer.length) {
            return false;
        }

        return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    }
}

const razorpayService = new RazorpayService();

module.exports = razorpayService;
module.exports.RazorpayService = RazorpayService;
