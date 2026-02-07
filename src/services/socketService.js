const Message = require('../models/Message');
const Chat = require('../models/Chat');

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
                this.users.set(userId, socket.id);
                socket.userId = userId;
                console.log(`User ${userId} joined`);
            });

            // Join chat room
            socket.on('join_chat', (chatId) => {
                socket.join(chatId);
                console.log(`User ${socket.userId} joined chat ${chatId}`);
            });

            // Send message
            socket.on('send_message', async (data) => {
                try {
                    const { chatId, text } = data;
                    const userId = socket.userId;

                    // Save message to DB
                    const message = await Message.create({
                        chatId,
                        sender: userId,
                        text,
                        readBy: [{ userId, readAt: new Date() }]
                    });

                    // Update chat last message
                    await Chat.findByIdAndUpdate(chatId, {
                        lastMessage: {
                            text,
                            sender: userId,
                            timestamp: new Date()
                        }
                    });

                    // Populate sender info
                    await message.populate('sender', 'name email');

                    // Emit to all users in chat room
                    this.io.to(chatId).emit('new_message', message);
                } catch (error) {
                    console.error('Error sending message:', error);
                    socket.emit('error', { message: 'Failed to send message' });
                }
            });

            // Typing indicator
            socket.on('typing', (data) => {
                const { chatId, isTyping } = data;
                socket.to(chatId).emit('user_typing', {
                    userId: socket.userId,
                    isTyping
                });
            });

            // Mark messages as read
            socket.on('mark_read', async (data) => {
                try {
                    const { chatId } = data;
                    const userId = socket.userId;

                    await Message.updateMany(
                        { chatId, 'readBy.userId': { $ne: userId } },
                        { $push: { readBy: { userId, readAt: new Date() } } }
                    );

                    socket.to(chatId).emit('messages_read', { userId, chatId });
                } catch (error) {
                    console.error('Error marking messages as read:', error);
                }
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
        const socketId = this.users.get(userId);
        if (socketId) {
            this.io.to(socketId).emit(event, data);
        }
    }

    // Send to all users in a chat
    sendToChat(chatId, event, data) {
        this.io.to(chatId).emit(event, data);
    }
}

module.exports = SocketService;
