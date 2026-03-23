const express = require('express');
const {
    register,
    login,
    googleLogin,
    getMe,
    updateProfile,
    updatePassword,
    logout,
    addExam,
    getDashboard,
    getTodayProgress,
    getTodayQuest,
    sendOtp,
    verifyOtpLogin,
    updateOnboarding
} = require('../controllers/authController');
const { sendOtp: sendSignupOtp, verifyOtp } = require('../auth/otp.controller');

const { protect } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);
// OTP flow temporarily disabled:
// router.post('/send-otp', sendSignupOtp);
// router.post('/verify-otp', verifyOtp);
router.post('/otp/send', sendOtp);
router.post('/otp/verify', verifyOtpLogin);

// Protected routes
router.use(protect); // All routes below require authentication

router.get('/me', getMe);
router.get('/dashboard', getDashboard);
router.get('/today-progress', getTodayProgress);
router.get('/today-quest', getTodayQuest);
router.put('/profile', updateProfile);
router.put('/onboarding', updateOnboarding);
router.put('/password', updatePassword);
router.get('/logout', logout);
router.post('/exams', addExam);

module.exports = router;
