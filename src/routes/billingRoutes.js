const express = require('express');
const {
    initiateCheckout,
    createOrder,
    verifyCheckout,
    verifyClientPayment,
    validateCoupon,
    getSubscriptionStatus,
    razorpayWebhook,
    createCoupon,
    updateCoupon,
    listCoupons,
    disableCoupon,
    listAllPayments
} = require('../controllers/billingController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.post('/webhook/razorpay', razorpayWebhook);

router.use(protect);

router.post('/checkout/initiate', initiateCheckout);
router.post('/order/create', createOrder);
router.post('/checkout/verify', verifyCheckout);
router.post('/verify', verifyClientPayment);
router.post('/coupons/validate', validateCoupon);
router.get('/subscription/status', getSubscriptionStatus);

// Strictly Administrative Endpoints (P0 Security Fix)
router.post('/admin/coupons', authorize('admin'), createCoupon);
router.patch('/admin/coupons/:id', authorize('admin'), updateCoupon);
router.get('/admin/coupons', authorize('admin'), listCoupons);
router.post('/admin/coupons/:id/disable', authorize('admin'), disableCoupon);
router.get('/admin/payments', authorize('admin'), listAllPayments);

module.exports = router;

