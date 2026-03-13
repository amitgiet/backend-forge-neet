const crypto = require('crypto');
const Razorpay = require('razorpay');

const getRazorpayClient = () => {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        throw new Error('Razorpay credentials are not configured');
    }

    return new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    });
};

const createOrder = async ({ amountPaise, receipt, notes = {} }) => {
    const razorpay = getRazorpayClient();
    return razorpay.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt,
        notes
    });
};

const verifyCheckoutSignature = ({ orderId, paymentId, signature }) => {
    const payload = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
        .update(payload)
        .digest('hex');

    return expectedSignature === signature;
};

const verifyWebhookSignature = ({ rawBody, signature }) => {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
        throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured');
    }

    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');

    return expectedSignature === signature;
};

module.exports = {
    createOrder,
    verifyCheckoutSignature,
    verifyWebhookSignature
};
