const Friend = require('../models/Friend');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');

// Search users by email or phone
exports.searchUsers = async (req, res) => {
    try {
        const { query } = req.query;
        const userId = req.user._id;
        
        const users = await User.find({
            _id: { $ne: userId },
            $or: [
                { email: { $regex: query, $options: 'i' } },
                { phone: { $regex: query, $options: 'i' } }
            ]
        }).select('name email phone').limit(20);
        
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
        });
        
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
        );
        
        if (!friend) {
            return res.status(404).json({ success: false, message: 'Friend request not found' });
        }
        
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
        });
        
        if (!chat) {
            chat = await Chat.create({
                type: 'direct',
                participants: [userId, friendId]
            });
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
        }).populate('participants', 'name email').sort({ 'lastMessage.timestamp': -1 });
        
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
        });
        
        await Chat.findByIdAndUpdate(chatId, {
            lastMessage: {
                text,
                sender: userId,
                timestamp: new Date()
            }
        });
        
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
            .populate('sender', 'name email')
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
            .select('name email stats')
            .sort({ 'stats.totalXP': -1 });
        
        const leaderboard = users.map((user, index) => ({
            rank: index + 1,
            userId: user._id,
            name: user.name,
            email: user.email,
            xp: user.stats?.totalXP || 0,
            streak: user.stats?.currentStreak || 0,
            isCurrentUser: user._id.toString() === userId.toString()
        }));
        
        res.json({ success: true, data: leaderboard });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
