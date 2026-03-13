const express = require('express');
const {
    initiateCheckout,
    verifyCheckout,
    validateCoupon,
    getSubscriptionStatus,
    razorpayWebhook,
    createCoupon,
    updateCoupon,
    listCoupons,
    disableCoupon
} = require('../controllers/billingController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.post('/webhook/razorpay', razorpayWebhook);

router.use(protect);

router.post('/checkout/initiate', initiateCheckout);
router.post('/checkout/verify', verifyCheckout);
router.post('/coupons/validate', validateCoupon);
router.get('/subscription/status', getSubscriptionStatus);

router.post('/admin/coupons', authorize('ultimate'), createCoupon);
router.patch('/admin/coupons/:id', authorize('ultimate'), updateCoupon);
router.get('/admin/coupons', authorize('ultimate'), listCoupons);
router.post('/admin/coupons/:id/disable', authorize('ultimate'), disableCoupon);

module.exports = router;
