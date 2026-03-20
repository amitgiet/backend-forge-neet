const Friend = require('../models/Friend');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const NotificationService = require('../services/notificationService');

// Search users by email, phone, or name
exports.searchUsers = async (req, res) => {
    try {
        const { query } = req.query;
        const userId = req.user._id;
        
        if (!query || query.trim().length === 0) {
            return res.json({ success: true, data: [] });
        }
        
        const users = await User.find({
            _id: { $ne: userId },
            $or: [
                { email: { $regex: query, $options: 'i' } },
                { phone: { $regex: query, $options: 'i' } },
                { name: { $regex: query, $options: 'i' } }
            ]
        }).select('_id name email phone avatar').limit(20);
        
        res.json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Send friend request
exports.sendFriendRequest = async (req, res) => {
    try {
        const userId = req.user._id;
        const { friendId } = req.body;
        
        // Prevent self-friending
        if (userId.toString() === friendId) {
            return res.status(400).json({ success: false, message: 'Cannot add yourself as friend' });
        }
        
        const existing = await Friend.findOne({
            $or: [
                { userId, friendId },
                { userId: friendId, friendId: userId }
            ]
        });
        
        if (existing) {
            return res.status(400).json({ success: false, message: 'Friend request already exists' });
        }
        
        const friend = await Friend.create({
            userId,
            friendId,
            requestedBy: userId,
            status: 'pending'
        }).then(f => f.populate('userId friendId', 'name email avatar'));
        
        // Emit socket event for real-time updates
        const io = req.app.get('io');
        if (io) {
            io.to(friendId.toString()).emit('friend_request_received', {
                fromUser: friend.userId,
                message: `${friend.userId.name} sent you a friend request`
            });
        }

        NotificationService.sendEventNotification(
            friendId,
            'friend_request',
            '👤 New Friend Request!',
            `${friend.userId.name || 'Someone'} sent you a friend request.`
        ).catch(err => console.error('Push error:', err));

        res.status(201).json({ success: true, data: friend });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Accept friend request
exports.acceptFriendRequest = async (req, res) => {
    try {
        const userId = req.user._id;
        const { friendId } = req.params;
        
        const friend = await Friend.findOneAndUpdate(
            { userId: friendId, friendId: userId, status: 'pending' },
            { status: 'accepted', acceptedAt: new Date() },
            { new: true }
        ).populate('userId friendId', 'name email avatar');
        
        if (!friend) {
            return res.status(404).json({ success: false, message: 'Friend request not found' });
        }
        
        // Emit socket event for real-time updates
        const io = req.app.get('io');
        if (io) {
            io.to(friendId.toString()).emit('friend_request_accepted', {
                user: friend.friendId,
                message: `${friend.friendId.name} accepted your friend request`
            });
        }

        NotificationService.sendEventNotification(
            friend.userId,
            'friend_accepted',
            '✅ Request Accepted!',
            `${friend.friendId.name || 'Someone'} accepted your friend request.`
        ).catch(err => console.error('Push error:', err));

        res.json({ success: true, data: friend });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get friends list
exports.getFriends = async (req, res) => {
    try {
        const userId = req.user._id;
        
        const friends = await Friend.find({
            $or: [{ userId }, { friendId: userId }],
            status: 'accepted'
        }).populate('userId friendId', 'name email');
        
        const friendsList = friends.map(f => 
            f.userId._id.toString() === userId.toString() ? f.friendId : f.userId
        );
        
        res.json({ success: true, data: friendsList });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get friend requests
exports.getFriendRequests = async (req, res) => {
    try {
        const userId = req.user._id;
        
        const requests = await Friend.find({
            friendId: userId,
            status: 'pending'
        }).populate('userId', 'name email');
        
        res.json({ success: true, data: requests });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Create or get direct chat
exports.createDirectChat = async (req, res) => {
    try {
        const userId = req.user._id;
        const { friendId } = req.body;
        
        let chat = await Chat.findOne({
            type: 'direct',
            participants: { $all: [userId, friendId] }
        }).populate('participants', 'name email avatar _id')
         .populate('lastMessage.sender', 'name email _id');
        
        if (!chat) {
            chat = await Chat.create({
                type: 'direct',
                participants: [userId, friendId]
            });
            chat = await chat.populate('participants', 'name email avatar _id');
        }
        
        res.json({ success: true, data: chat });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Create group chat
exports.createGroupChat = async (req, res) => {
    try {
        const userId = req.user._id;
        const { name, participants } = req.body;
        
        const chat = await Chat.create({
            type: 'group',
            name,
            participants: [userId, ...participants],
            admin: userId
        });
        
        res.status(201).json({ success: true, data: chat });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get user chats
exports.getChats = async (req, res) => {
    try {
        const userId = req.user._id;
        
        const chats = await Chat.find({
            participants: userId,
            isActive: true
        }).populate('participants', 'name email avatar _id')
         .populate('lastMessage.sender', 'name email _id')
         .sort({ updatedAt: -1 });
        
        res.json({ success: true, data: chats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Send message
exports.sendMessage = async (req, res) => {
    try {
        const userId = req.user._id;
        const { chatId, text } = req.body;
        
        const message = await Message.create({
            chatId,
            sender: userId,
            text,
            readBy: [{ userId, readAt: new Date() }]
        }).then(m => m.populate('sender', 'name email avatar _id'));
        
        const updatedChat = await Chat.findByIdAndUpdate(chatId, {
            lastMessage: {
                text,
                sender: userId,
                timestamp: new Date()
            },
            updatedAt: new Date()
        }, { new: true });

        if (updatedChat && updatedChat.participants) {
            updatedChat.participants.forEach(pId => {
                if (String(pId) !== String(userId)) {
                    NotificationService.sendEventNotification(
                        pId,
                        'new_message',
                        updatedChat.type === 'group' ? `💬 ${updatedChat.name || 'Group Chat'}` : '💬 New Message',
                        `${message.sender.name}: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`
                    ).catch(err => console.error('Push error:', err));
                }
            });
        }

        res.status(201).json({ success: true, data: message });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get messages
exports.getMessages = async (req, res) => {
    try {
        const { chatId } = req.params;
        const { limit = 50, skip = 0 } = req.query;
        
        const messages = await Message.find({ chatId, isDeleted: false })
            .populate('sender', 'name email avatar _id')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip));
        
        res.json({ success: true, data: messages.reverse() });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get friends leaderboard
exports.getFriendsLeaderboard = async (req, res) => {
    try {
        const userId = req.user._id;
        
        const friends = await Friend.find({
            $or: [{ userId }, { friendId: userId }],
            status: 'accepted'
        });
        
        const friendIds = friends.map(f => 
            f.userId.toString() === userId.toString() ? f.friendId : f.userId
        );
        friendIds.push(userId);
        
        const users = await User.find({ _id: { $in: friendIds } })
            .select('name email avatar gamification _id')
            .sort({ 'gamification.totalXP': -1 });
        
        const leaderboard = users.map((user, index) => ({
            rank: index + 1,
            userId: user._id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            xp: user.gamification?.totalXP || 0,
            streak: user.gamification?.currentStreak || 0,
            isCurrentUser: user._id.toString() === userId.toString()
        }));
        
        res.json({ success: true, data: leaderboard });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
