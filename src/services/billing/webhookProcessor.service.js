const mongoose = require('mongoose');
const User = require('../../models/User');
const SubscriptionPayment = require('../../models/SubscriptionPayment');
const Coupon = require('../../models/Coupon');
const ReferralReward = require('../../models/ReferralReward');

class WebhookProcessorService {
    async processCapturedPayment(paymentPayload) {
        const { id: paymentId, order_id: orderId, amount, notes = {} } = paymentPayload;
        const { userId, planId, couponCode, durationDays = 365 } = notes;

        const session = await mongoose.startSession();

        try {
            let result;
            await session.withTransaction(async () => {
                // 1. Idempotency Check: verify payment not already processed
                const existingPayment = await SubscriptionPayment.findOne({
                    $or: [
                        { paymentId },
                        { razorpayPaymentId: paymentId }
                    ]
                }).session(session);

                if (existingPayment) {
                    result = { status: 'already_processed' };
                    return;
                }

                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + parseInt(durationDays, 10));

                // 2. Record Financial Payment Record
                await SubscriptionPayment.create([{
                    paymentId,
                    razorpayPaymentId: paymentId,
                    orderId,
                    razorpayOrderId: orderId,
                    userId,
                    amountPaise: amount,
                    baseAmountPaise: amount,
                    finalAmountPaise: amount,
                    currency: 'INR',
                    status: 'captured',
                    plan: planId || 'pro',
                    planCode: planId || 'PRO_MONTHLY',
                    couponCode: couponCode || null,
                    metadata: notes
                }], { session });

                // 3. Atomically Upgrade User Entitlement
                const updatedUser = await User.findByIdAndUpdate(
                    userId,
                    {
                        $set: {
                            'subscription.plan': 'pro',
                            'subscription.status': 'active',
                            'subscription.currentPeriodStart': new Date(),
                            'subscription.currentPeriodEnd': expiryDate,
                            'subscription.lastPaymentId': paymentId
                        }
                    },
                    { session, new: true }
                );

                // 4. Mark Coupon Used (if applicable)
                if (couponCode) {
                    await Coupon.findOneAndUpdate(
                        { code: couponCode },
                        { $inc: { timesUsed: 1, currentUses: 1 } },
                        { session }
                    );
                }

                result = { status: 'success', user: updatedUser };
            });

            return result;
        } finally {
            session.endSession();
        }
    }
}

const webhookProcessorService = new WebhookProcessorService();

module.exports = webhookProcessorService;
module.exports.WebhookProcessorService = WebhookProcessorService;
