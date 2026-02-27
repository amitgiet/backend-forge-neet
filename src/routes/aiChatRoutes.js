const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
    sendMessage,
    getChatHistory,
    createNewChat,
    deleteChat
} = require('../controllers/aiChatController');

router.use(protect);

router.post('/message', sendMessage);
router.post('/new', createNewChat);
router.get('/history/:chatId?', getChatHistory);
router.delete('/:chatId', deleteChat);

module.exports = router;
