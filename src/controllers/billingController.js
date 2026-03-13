const User = require('../models/User');
const Coupon = require('../models/Coupon');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const { createOrder, verifyCheckoutSignature, verifyWebhookSignature } = require('../services/razorpay.service');
const { getPricingBreakdown } = require('../services/pricing.service');
const referralService = require('../services/referral.service');
const { processRazorpayWebhook } = require('../services/webhookProcessor.service');

const PLAN_CODE = 'PRO_MONTHLY';

// @desc    Initiate Razorpay checkout for premium
// @route   POST /api/v1/billing/checkout/initiate
// @access  Private
exports.initiateCheckout = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { planCode, couponCode, referralCode } = req.body;

        if (planCode !== PLAN_CODE) {
            return res.status(400).json({ success: false, message: 'Invalid plan code' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Ensure user always has a stable referral code.
        await referralService.ensureReferralForUser(user);

        const pricing = await getPricingBreakdown({
            planCode,
            couponCode,
            userId
        });

        let referral = null;
        const appliedReferralCode = user.referredByCode || referralCode;

        if (user.referredByCode && referralCode && user.referredByCode !== referralCode.trim().toUpperCase()) {
            return res.status(400).json({
                success: false,
                message: 'Referral code is already locked for this account'
            });
        }

        if (appliedReferralCode) {
            referral = await referralService.validateReferralCode({
                referralCode: appliedReferralCode,
                userId
            });

            if (!user.referredByCode) {
                user.referredByCode = referral.code;
                await user.save({ validateBeforeSave: false });
            }
        }

        const receipt = `sub_${String(userId).slice(-6)}_${Date.now()}`;
        const razorpayOrder = await createOrder({
            amountPaise: pricing.finalAmountPaise,
            receipt,
            notes: {
                userId: String(userId),
                planCode
            }
        });

        await SubscriptionPayment.create({
            userId,
            planCode,
            baseAmountPaise: pricing.baseAmountPaise,
            discountAmountPaise: pricing.discountAmountPaise,
            finalAmountPaise: pricing.finalAmountPaise,
            currency: 'INR',
            couponCode: pricing.coupon?.code || null,
            referralCodeUsed: referral?.code || null,
            referredByUserId: referral?.ownerUserId || null,
            razorpayOrderId: razorpayOrder.id,
            status: 'created',
            metadata: {
                receipt,
                order: razorpayOrder
            }
        });

        return res.status(200).json({
            success: true,
            checkout: {
                keyId: process.env.RAZORPAY_KEY_ID,
                orderId: razorpayOrder.id,
                amountPaise: pricing.finalAmountPaise,
                currency: 'INR'
            },
            pricing: {
                baseAmountPaise: pricing.baseAmountPaise,
                discountAmountPaise: pricing.discountAmountPaise,
                finalAmountPaise: pricing.finalAmountPaise,
                couponApplied: pricing.coupon?.code || null
            }
        });
    } catch (error) {
        return next(error);
    }
};

// @desc    Verify checkout signature and mark payment pending webhook confirmation
// @route   POST /api/v1/billing/checkout/verify
// @access  Private
exports.verifyCheckout = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
        }

        const isValid = verifyCheckoutSignature({
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
            signature: razorpay_signature
        });

        if (!isValid) {
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        const paymentDoc = await SubscriptionPayment.findOne({
            userId,
            razorpayOrderId: razorpay_order_id
        });

        if (!paymentDoc) {
            return res.status(404).json({ success: false, message: 'Payment order not found' });
        }

        if (paymentDoc.status === 'created') {
            paymentDoc.status = 'pending_webhook_confirmation';
            paymentDoc.razorpayPaymentId = razorpay_payment_id;
            await paymentDoc.save();
        }

        return res.status(200).json({
            success: true,
            message: 'Payment verification accepted. Awaiting confirmation.'
        });
    } catch (error) {
        return next(error);
    }
};

// @desc    Validate coupon and return pricing preview
// @route   POST /api/v1/billing/coupons/validate
// @access  Private
exports.validateCoupon = async (req, res, next) => {
    try {
        const { code, planCode } = req.body;
        if (planCode !== PLAN_CODE) {
            return res.status(400).json({ success: false, message: 'Invalid plan code' });
        }

        const pricing = await getPricingBreakdown({
            planCode,
            couponCode: code,
            userId: req.user._id
        });

        return res.status(200).json({
            success: true,
            pricing: {
                baseAmountPaise: pricing.baseAmountPaise,
                discountAmountPaise: pricing.discountAmountPaise,
                finalAmountPaise: pricing.finalAmountPaise,
                couponApplied: pricing.coupon?.code || null
            }
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message || 'Coupon validation failed'
        });
    }
};

// @desc    Get user subscription status
// @route   GET /api/v1/billing/subscription/status
// @access  Private
exports.getSubscriptionStatus = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id).select('subscription');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const now = new Date();
        const periodEnd = user.subscription?.currentPeriodEnd
            ? new Date(user.subscription.currentPeriodEnd)
            : null;
        const isActive = Boolean(
            user.subscription?.plan === 'pro' &&
            periodEnd &&
            periodEnd > now
        );

        return res.status(200).json({
            success: true,
            data: {
                plan: user.subscription?.plan || 'free',
                status: user.subscription?.status || 'active',
                currentPeriodStart: user.subscription?.currentPeriodStart || null,
                currentPeriodEnd: user.subscription?.currentPeriodEnd || null,
                isActive
            }
        });
    } catch (error) {
        return next(error);
    }
};

// @desc    Razorpay webhook receiver
// @route   POST /api/v1/billing/webhook/razorpay
// @access  Public
exports.razorpayWebhook = async (req, res, next) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        const eventId = req.headers['x-razorpay-event-id'];
        const rawBody = req.body;

        if (!signature || !eventId || !Buffer.isBuffer(rawBody)) {
            return res.status(400).json({ success: false, message: 'Invalid webhook payload' });
        }

        const isSignatureValid = verifyWebhookSignature({ rawBody, signature });
        if (!isSignatureValid) {
            return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
        }

        const payload = JSON.parse(rawBody.toString('utf8'));
        const eventType = payload?.event || 'unknown';

        await processRazorpayWebhook({
            eventId: String(eventId),
            eventType,
            payload,
            rawBody
        });

        return res.status(200).json({ success: true });
    } catch (error) {
        return next(error);
    }
};

// @desc    Create coupon (admin)
// @route   POST /api/v1/billing/admin/coupons
// @access  Private (ultimate for now)
exports.createCoupon = async (req, res, next) => {
    try {
        const payload = {
            ...req.body,
            code: String(req.body.code || '').trim().toUpperCase()
        };
        const coupon = await Coupon.create(payload);
        return res.status(201).json({ success: true, data: coupon });
    } catch (error) {
        return next(error);
    }
};

// @desc    Update coupon (admin)
// @route   PATCH /api/v1/billing/admin/coupons/:id
// @access  Private (ultimate for now)
exports.updateCoupon = async (req, res, next) => {
    try {
        const update = { ...req.body };
        if (update.code) update.code = String(update.code).trim().toUpperCase();

        const coupon = await Coupon.findByIdAndUpdate(
            req.params.id,
            update,
            { new: true, runValidators: true }
        );

        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found' });
        }

        return res.status(200).json({ success: true, data: coupon });
    } catch (error) {
        return next(error);
    }
};

// @desc    List coupons (admin)
// @route   GET /api/v1/billing/admin/coupons
// @access  Private (ultimate for now)
exports.listCoupons = async (req, res, next) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        return res.status(200).json({ success: true, data: coupons });
    } catch (error) {
        return next(error);
    }
};

// @desc    Disable coupon (admin)
// @route   POST /api/v1/billing/admin/coupons/:id/disable
// @access  Private (ultimate for now)
exports.disableCoupon = async (req, res, next) => {
    try {
        const coupon = await Coupon.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );
        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found' });
        }
        return res.status(200).json({ success: true, data: coupon });
    } catch (error) {
        return next(error);
    }
};
