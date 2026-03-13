const crypto = require('crypto');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const WebhookEventLog = require('../models/WebhookEventLog');
const { BILLING_PLANS } = require('../config/billingConfig');
const subscriptionService = require('./subscription.service');
const referralService = require('./referral.service');
const { finalizeCouponRedemption } = require('./coupon.service');

const buildPayloadHash = (rawBody) =>
    crypto.createHash('sha256').update(rawBody).digest('hex');

const extractPaymentEntity = (eventType, payload) => {
    if (eventType === 'payment.captured' || eventType === 'payment.failed' || eventType === 'payment.refunded') {
        return payload?.payload?.payment?.entity || null;
    }
    if (eventType === 'order.paid') {
        return payload?.payload?.payment?.entity || null;
    }
    return null;
};

const markEvent = async ({ eventId, eventType, payloadHash, status, errorMessage = null }) => {
    return WebhookEventLog.create({
        provider: 'razorpay',
        eventId,
        eventType,
        payloadHash,
        processedAt: new Date(),
        status,
        errorMessage
    });
};

const processPaymentCaptured = async (paymentEntity) => {
    const orderId = paymentEntity.order_id;
    const paymentId = paymentEntity.id;

    const paymentDoc = await SubscriptionPayment.findOne({ razorpayOrderId: orderId });
    if (!paymentDoc) return { status: 'ignored', reason: 'order_not_found' };
    if (paymentDoc.status === 'paid') return { status: 'ignored', reason: 'already_paid' };

    paymentDoc.razorpayPaymentId = paymentId;
    paymentDoc.status = 'paid';
    paymentDoc.paidAt = new Date();
    await paymentDoc.save();

    await subscriptionService.activateProForDays(
        paymentDoc.userId,
        BILLING_PLANS[paymentDoc.planCode].validityDays,
        paymentDoc._id
    );

    await finalizeCouponRedemption({
        couponCode: paymentDoc.couponCode,
        userId: paymentDoc.userId,
        paymentId: paymentDoc._id,
        discountAmountPaise: paymentDoc.discountAmountPaise
    });

    await referralService.grantReferralRewardForPayment(paymentDoc);

    return { status: 'processed' };
};

const processPaymentFailed = async (paymentEntity) => {
    const orderId = paymentEntity.order_id;
    const paymentDoc = await SubscriptionPayment.findOne({ razorpayOrderId: orderId });
    if (!paymentDoc) return { status: 'ignored', reason: 'order_not_found' };
    if (paymentDoc.status === 'paid' || paymentDoc.status === 'refunded') {
        return { status: 'ignored', reason: 'already_final' };
    }

    paymentDoc.status = 'failed';
    await paymentDoc.save();
    return { status: 'processed' };
};

const processPaymentRefunded = async (paymentEntity) => {
    const paymentId = paymentEntity.id;
    const orderId = paymentEntity.order_id;

    const paymentDoc =
        (await SubscriptionPayment.findOne({ razorpayPaymentId: paymentId })) ||
        (await SubscriptionPayment.findOne({ razorpayOrderId: orderId }));

    if (!paymentDoc) return { status: 'ignored', reason: 'payment_not_found' };
    if (paymentDoc.status === 'refunded') return { status: 'ignored', reason: 'already_refunded' };

    paymentDoc.status = 'refunded';
    paymentDoc.refundedAt = new Date();
    await paymentDoc.save();

    await subscriptionService.revokeDays(
        paymentDoc.userId,
        BILLING_PLANS[paymentDoc.planCode].validityDays
    );
    await subscriptionService.downgradeIfExpired(paymentDoc.userId);
    await referralService.revokeReferralRewardForRefund(paymentDoc);

    return { status: 'processed' };
};

const processRazorpayWebhook = async ({ eventId, eventType, payload, rawBody }) => {
    const payloadHash = buildPayloadHash(rawBody);

    const existing = await WebhookEventLog.findOne({ eventId });
    if (existing) return { status: 'ignored', reason: 'duplicate_event' };

    try {
        const paymentEntity = extractPaymentEntity(eventType, payload);
        let result = { status: 'ignored', reason: 'event_not_supported' };

        if (!paymentEntity) {
            result = { status: 'ignored', reason: 'missing_payment_entity' };
        } else if (eventType === 'payment.captured' || eventType === 'order.paid') {
            result = await processPaymentCaptured(paymentEntity);
        } else if (eventType === 'payment.failed') {
            result = await processPaymentFailed(paymentEntity);
        } else if (eventType === 'payment.refunded') {
            result = await processPaymentRefunded(paymentEntity);
        }

        await markEvent({
            eventId,
            eventType,
            payloadHash,
            status: result.status === 'processed' ? 'processed' : 'ignored',
            errorMessage: result.reason || null
        });

        return result;
    } catch (error) {
        await markEvent({
            eventId,
            eventType,
            payloadHash,
            status: 'failed',
            errorMessage: error.message
        });
        throw error;
    }
};

module.exports = {
    processRazorpayWebhook
};
