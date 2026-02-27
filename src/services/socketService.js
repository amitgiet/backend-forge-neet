class SocketService {
    constructor(io) {
        this.io = io;
        this.users = new Map(); // userId -> socketId
    }

    initialize() {
        this.io.on('connection', (socket) => {
            console.log('User connected:', socket.id);

            // User joins with their ID
            socket.on('join', (userId) => {
                const userIdStr = userId.toString();
                this.users.set(userIdStr, socket.id);
                socket.userId = userIdStr;
                socket.join(userIdStr); // Join user's personal room
                console.log(`User ${userIdStr} joined with socket ${socket.id}`);
            });

            // Join chat room
            socket.on('join_chat', (chatId) => {
                const chatIdStr = chatId.toString();
                socket.join(chatIdStr);
                console.log(`User ${socket.userId} joined chat ${chatIdStr}`);
                
                // Notify others in chat that user is online
                socket.to(chatIdStr).emit('user_online', { userId: socket.userId });
            });

            // Leave chat room
            socket.on('leave_chat', (chatId) => {
                const chatIdStr = chatId.toString();
                socket.leave(chatIdStr);
                console.log(`User ${socket.userId} left chat ${chatIdStr}`);
            });

            // Send message
            socket.on('send_message', async (data) => {
                try {
                    const { chatId, text } = data;
                    const userId = socket.userId;

                    const Message = require('../models/Message');
                    const Chat = require('../models/Chat');

                    // Save message to DB
                    const message = await Message.create({
                        chatId,
                        sender: userId,
                        text,
                        readBy: [{ userId, readAt: new Date() }]
                    }).then(m => m.populate('sender', 'name email avatar _id'));

                    // Update chat last message
                    await Chat.findByIdAndUpdate(chatId, {
                        lastMessage: {
                            text,
                            sender: userId,
                            timestamp: new Date()
                        },
                        updatedAt: new Date()
                    });

                    // Emit to all users in chat room
                    this.io.to(chatId.toString()).emit('new_message', message);
                    console.log(`Message sent in chat ${chatId} by ${userId}`);
                } catch (error) {
                    console.error('Error sending message:', error);
                    socket.emit('error', { message: 'Failed to send message' });
                }
            });

            // Typing indicator
            socket.on('typing', (data) => {
                const { chatId, isTyping } = data;
                socket.to(chatId.toString()).emit('user_typing', {
                    userId: socket.userId,
                    isTyping
                });
            });

            // Mark messages as read
            socket.on('mark_read', async (data) => {
                try {
                    const { chatId } = data;
                    const userId = socket.userId;

                    const Message = require('../models/Message');

                    await Message.updateMany(
                        { chatId, 'readBy.userId': { $ne: userId } },
                        { $push: { readBy: { userId, readAt: new Date() } } }
                    );

                    socket.to(chatId.toString()).emit('messages_read', { userId, chatId });
                } catch (error) {
                    console.error('Error marking messages as read:', error);
                }
            });

            // Friend request received (listen from frontend)
            socket.on('friend_request_sent', (data) => {
                const { toUserId, fromUser } = data;
                this.sendToUser(toUserId.toString(), 'friend_request_received', {
                    fromUser,
                    message: `${fromUser.name} sent you a friend request`
                });
            });

            // Friend request accepted (listen from frontend)
            socket.on('friend_request_accepted', (data) => {
                const { toUserId, user } = data;
                this.sendToUser(toUserId.toString(), 'friend_request_accepted', {
                    user,
                    message: `${user.name} accepted your friend request`
                });
            });

            // Notify friends list updated
            socket.on('friends_updated', (data) => {
                const { userId } = data;
                this.sendToUser(userId.toString(), 'friends_list_updated', data);
            });

            // Disconnect
            socket.on('disconnect', () => {
                if (socket.userId) {
                    this.users.delete(socket.userId);
                    console.log(`User ${socket.userId} disconnected`);
                }
            });
        });
    }

    // Send notification to specific user
    sendToUser(userId, event, data) {
        const userIdStr = userId.toString();
        const socketId = this.users.get(userIdStr);
        if (socketId) {
            this.io.to(socketId).emit(event, data);
            console.log(`Sent ${event} to user ${userIdStr}`);
        } else {
            console.log(`User ${userIdStr} not connected for event ${event}`);
        }
    }

    // Send to all users in a chat
    sendToChat(chatId, event, data) {
        this.io.to(chatId.toString()).emit(event, data);
    }

    // Check if user is connected
    isUserConnected(userId) {
        return this.users.has(userId.toString());
    }

    // Get all connected users
    getConnectedUsers() {
        return Array.from(this.users.keys());
    }
}

module.exports = SocketService;
