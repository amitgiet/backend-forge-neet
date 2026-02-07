const express = require('express');
const router = express.Router();
const socialController = require('../controllers/socialController');
const { protect } = require('../middleware/auth');

router.use(protect);

// Friends
router.get('/users/search', socialController.searchUsers);
router.post('/friends/request', socialController.sendFriendRequest);
router.post('/friends/accept/:friendId', socialController.acceptFriendRequest);
router.get('/friends', socialController.getFriends);
router.get('/friends/requests', socialController.getFriendRequests);
router.get('/friends/leaderboard', socialController.getFriendsLeaderboard);

// Chats
router.post('/chats/direct', socialController.createDirectChat);
router.post('/chats/group', socialController.createGroupChat);
router.get('/chats', socialController.getChats);

// Messages
router.post('/messages', socialController.sendMessage);
router.get('/messages/:chatId', socialController.getMessages);

module.exports = router;
