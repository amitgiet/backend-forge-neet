const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/auth');
const {
    sendMessage,
    getChatHistory,
    createNewChat,
    deleteChat,
    submitFeedback
} = require('../controllers/aiChatController');

router.use(protect);

const aiChatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const uid = req.user?._id ? String(req.user._id) : 'anon';
        return `${uid}:${req.ip}`;
    },
    message: { success: false, message: 'Too many AI requests. Please wait a moment.' }
});

router.post('/message', aiChatLimiter, sendMessage);
router.post('/new', createNewChat);
router.get('/history/:chatId?', getChatHistory);
router.post('/feedback', submitFeedback);
router.delete('/:chatId', deleteChat);

module.exports = router;
