const razorpayService = require('./billing/razorpay.service');

const createOrder = (options) => razorpayService.createOrder(options);

const verifyCheckoutSignature = (params) => razorpayService.verifyCheckoutSignature(params);

const verifyWebhookSignature = (params) => razorpayService.verifyWebhookSignature(params);

module.exports = {
    createOrder,
    verifyCheckoutSignature,
    verifyWebhookSignature,
    razorpayService
};
