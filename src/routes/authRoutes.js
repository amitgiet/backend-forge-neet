const express = require('express');
const {
    register,
    login,
    getMe,
    updateProfile,
    updatePassword,
    logout,
    addExam,
    getDashboard,
    sendOtp,
    verifyOtpLogin,
    updateOnboarding
} = require('../controllers/authController');

const { protect } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/otp/send', sendOtp);
router.post('/otp/verify', verifyOtpLogin);

// Protected routes
router.use(protect); // All routes below require authentication

router.get('/me', getMe);
router.get('/dashboard', getDashboard);
router.put('/profile', updateProfile);
router.put('/onboarding', updateOnboarding);
router.put('/password', updatePassword);
router.get('/logout', logout);
router.post('/exams', addExam);

module.exports = router;
