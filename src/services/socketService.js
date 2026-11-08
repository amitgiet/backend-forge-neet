const jwt = require('jsonwebtoken');
const redisClient = require('../config/redis');

class SocketService {
  constructor(io) {
    this.io = io;
    this.users = new Map();
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return this;
    this.initialized = true;

    this.io.use((socket, next) => {
      const authHeader = socket.handshake.headers?.authorization;
      const token = socket.handshake.auth?.token || (authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null);

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
        socket.userId = (decoded.id || decoded._id || '').toString();
        next();
      } catch (err) {
        return next(new Error('Invalid authentication token'));
      }
    });

    this.io.on('connection', (socket) => {
      const userId = socket.userId || (socket.user && (socket.user.id || socket.user._id));
      if (userId) {
        const userIdStr = userId.toString();
        this.users.set(userIdStr, socket.id);
        socket.userId = userIdStr;
        socket.join(userIdStr);
        socket.join(`user_${userIdStr}`);
      }

      socket.on('join', (explicitUserId) => {
        const idToUse = (socket.userId || explicitUserId).toString();
        this.users.set(idToUse, socket.id);
        socket.userId = idToUse;
        socket.join(idToUse);
        socket.join(`user_${idToUse}`);
      });

      socket.on('join_matchmaking', async () => {
        try {
          const currentUserId = (socket.userId || (socket.user && (socket.user.id || socket.user._id))).toString();
          const opponentId = await redisClient.spop('matchmaking:pool');

          if (opponentId && opponentId !== currentUserId) {
            const matchRoom = `duel_${currentUserId}_${opponentId}`;
            socket.join(matchRoom);
            this.io.to(`user_${opponentId}`).emit('match_found', { matchRoom, opponentId: currentUserId });
            socket.emit('match_found', { matchRoom, opponentId });
          } else {
            await redisClient.sadd('matchmaking:pool', currentUserId);
            socket.join(`user_${currentUserId}`);
            socket.emit('matchmaking_waiting');
          }
        } catch (error) {
          socket.emit('error', { message: 'Matchmaking error' });
        }
      });

      socket.on('submit_answer', ({ matchRoom, questionIndex, isCorrect, timeSpent }) => {
        const currentUserId = socket.userId || (socket.user && (socket.user.id || socket.user._id));
        let validIsCorrect = isCorrect;
        if (timeSpent > 15) {
          validIsCorrect = false;
        }

        socket.to(matchRoom).emit('opponent_progress', {
          opponentId: currentUserId,
          questionIndex,
          isCorrect: validIsCorrect,
          scoreIncrement: validIsCorrect ? 4 : -1
        });
      });

      socket.on('join_chat', (chatId) => {
        const chatIdStr = chatId.toString();
        socket.join(chatIdStr);
        socket.to(chatIdStr).emit('user_online', { userId: socket.userId });
      });

      socket.on('leave_chat', (chatId) => {
        const chatIdStr = chatId.toString();
        socket.leave(chatIdStr);
      });

      socket.on('send_message', async (data) => {
        try {
          const { chatId, text } = data;
          const currentUserId = socket.userId;

          const Message = require('../models/Message');
          const Chat = require('../models/Chat');

          const message = await Message.create({
            chatId,
            sender: currentUserId,
            text,
            readBy: [{ userId: currentUserId, readAt: new Date() }]
          }).then(m => m.populate('sender', 'name email avatar _id'));

          await Chat.findByIdAndUpdate(chatId, {
            lastMessage: {
              text,
              sender: currentUserId,
              timestamp: new Date()
            },
            updatedAt: new Date()
          });

          this.io.to(chatId.toString()).emit('new_message', message);
        } catch (error) {
          socket.emit('error', { message: 'Failed to send message' });
        }
      });

      socket.on('typing', (data) => {
        const { chatId, isTyping } = data;
        socket.to(chatId.toString()).emit('user_typing', {
          userId: socket.userId,
          isTyping
        });
      });

      socket.on('mark_read', async (data) => {
        try {
          const { chatId } = data;
          const currentUserId = socket.userId;

          const Message = require('../models/Message');

          await Message.updateMany(
            { chatId, 'readBy.userId': { $ne: currentUserId } },
            { $push: { readBy: { userId: currentUserId, readAt: new Date() } } }
          );

          socket.to(chatId.toString()).emit('messages_read', { userId: currentUserId, chatId });
        } catch (error) {
          // ignore error
        }
      });

      socket.on('friend_request_sent', (data) => {
        const { toUserId, fromUser } = data;
        this.sendToUser(toUserId.toString(), 'friend_request_received', {
          fromUser,
          message: `${fromUser.name} sent you a friend request`
        });
      });

      socket.on('friend_request_accepted', (data) => {
        const { toUserId, user } = data;
        this.sendToUser(toUserId.toString(), 'friend_request_accepted', {
          user,
          message: `${user.name} accepted your friend request`
        });
      });

      socket.on('friends_updated', (data) => {
        const { userId: targetUserId } = data;
        this.sendToUser(targetUserId.toString(), 'friends_list_updated', data);
      });

      socket.on('disconnect', async () => {
        const currentUserId = socket.userId || (socket.user && (socket.user.id || socket.user._id));
        if (currentUserId) {
          const uidStr = currentUserId.toString();
          this.users.delete(uidStr);
          await redisClient.srem('matchmaking:pool', uidStr);
        }
      });
    });

    return this;
  }

  sendToUser(userId, event, data) {
    const userIdStr = userId.toString();
    const socketId = this.users.get(userIdStr);
    if (socketId) {
      this.io.to(socketId).emit(event, data);
    }
  }

  sendToChat(chatId, event, data) {
    this.io.to(chatId.toString()).emit(event, data);
  }

  isUserConnected(userId) {
    return this.users.has(userId.toString());
  }

  getConnectedUsers() {
    return Array.from(this.users.keys());
  }
}

function socketServiceFactory(io) {
  if (new.target || this instanceof socketServiceFactory) {
    return new SocketService(io);
  }
  const svc = new SocketService(io);
  svc.initialize();
  return svc;
}

SocketService.prototype.constructor = socketServiceFactory;
Object.setPrototypeOf(socketServiceFactory, SocketService);
socketServiceFactory.prototype = SocketService.prototype;

module.exports = socketServiceFactory;
