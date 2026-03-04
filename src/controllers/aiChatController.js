const AIAgentService = require('../services/aiAgentService');
const Chat = require('../models/Chat');
const ChatSummaryService = require('../services/chatSummaryService');
const AIUsage = require('../models/AIUsage');

const aiAgent = new AIAgentService();

// @desc    Send message to AI assistant
// @route   POST /api/ai-chat/message
// @access  Private
exports.sendMessage = async (req, res) => {
    try {
        const { message, chatId, mode = 'coach', clientContext = {} } = req.body;
        const userId = req.user._id;

        if (!message || message.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Message is required' });
        }

        // Get or create chat history
        let chat;
        if (chatId) {
            chat = await Chat.findOne({ _id: chatId, participants: userId });
        }

        const fullMessages = Array.isArray(chat?.messages) ? chat.messages : [];
        const contextWindow = 25;
        const recentMessages = fullMessages.slice(-contextWindow);

        let chatHistory = recentMessages.map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            content: m.content
        }));
        
        // Gemini requires chat history to start with a user message.
        while (chatHistory.length > 0 && chatHistory[0].role !== 'user') {
            chatHistory.shift();
        }

        // Get AI response
        const aiResponse = await aiAgent.chat(userId, message, chatHistory, chat?.summary || '', {
            mode,
            clientContext,
            user: req.user
        });

        // Validate AI response
        if (!aiResponse || !aiResponse.message || aiResponse.message.trim().length === 0) {
            throw new Error('AI returned empty response');
        }

        // Save to database
        if (!chat) {
            chat = await Chat.create({
                type: 'direct', // AI chat type
                participants: [userId],
                messages: [],
                summary: '',
                messagesSinceSummary: 0
            });
        }

        chat.messages.push(
            { sender: 'user', content: message },
            { sender: 'ai', content: aiResponse.message.trim() }
        );

        chat.messagesSinceSummary = Number(chat.messagesSinceSummary || 0) + 2;

        if (chat.messagesSinceSummary >= 10) {
            try {
                const lastForSummary = chat.messages.slice(-30);
                const updated = await ChatSummaryService.summarize({
                    previousSummary: chat.summary || '',
                    recentMessages: lastForSummary.map(m => ({ sender: m.sender, content: m.content }))
                });
                if (updated && updated.length > 0) {
                    chat.summary = updated;
                    chat.summaryUpdatedAt = new Date();
                }
                chat.messagesSinceSummary = 0;
            } catch (e) {
                // Keep existing summary; avoid repeatedly trying every message
                chat.messagesSinceSummary = 0;
            }
        }

        await chat.save();

        res.json({
            success: true,
            data: {
                chatId: chat._id,
                message: aiResponse.message,
                ui: aiResponse.ui || null,
                toolsUsed: aiResponse.toolsUsed || [],
                dataSourcesUsed: aiResponse.dataSourcesUsed || [],
                dataAvailability: aiResponse.dataAvailability || 'insufficient'
            }
        });

    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to process message'
        });
    }
};

// @desc    Get chat history
// @route   GET /api/ai-chat/history/:chatId?
// @access  Private
exports.getChatHistory = async (req, res) => {
    try {
        const userId = req.user._id;
        const { chatId } = req.params;
        const limitRaw = req.query.limit;
        const limit = Math.max(1, Math.min(50, parseInt(limitRaw, 10) || 15));

        if (chatId) {
            const chat = await Chat.findOne({ _id: chatId, participants: userId }).lean();
            if (!chat) {
                return res.status(404).json({ success: false, message: 'Chat not found' });
            }
            const trimmed = {
                ...chat,
                messages: Array.isArray(chat.messages) ? chat.messages.slice(-limit) : []
            };
            return res.json({ success: true, data: trimmed });
        }

        // Get all chats for user
        const chats = await Chat.find({ participants: userId })
            .sort({ updatedAt: -1 })
            .limit(10);

        res.json({ success: true, data: chats });

    } catch (error) {
        console.error('Get chat history error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch chat history' });
    }
};

// @desc    Create new chat
// @route   POST /api/ai-chat/new
// @access  Private
exports.createNewChat = async (req, res) => {
    try {
        const userId = req.user._id;

        const chat = await Chat.create({
            type: 'direct', // AI chat type
            participants: [userId],
            messages: [],
            summary: '',
            messagesSinceSummary: 0
        });

        res.json({ success: true, data: { chatId: chat._id } });

    } catch (error) {
        console.error('Create chat error:', error);
        res.status(500).json({ success: false, message: 'Failed to create chat' });
    }
};

// @desc    Delete chat
// @route   DELETE /api/ai-chat/:chatId
// @access  Private
exports.deleteChat = async (req, res) => {
    try {
        const userId = req.user._id;
        const { chatId } = req.params;

        const chat = await Chat.findOneAndDelete({ _id: chatId, participants: userId });

        if (!chat) {
            return res.status(404).json({ success: false, message: 'Chat not found' });
        }

        res.json({ success: true, message: 'Chat deleted' });

    } catch (error) {
        console.error('Delete chat error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete chat' });
    }
};

// @desc    Capture user feedback on AI response quality
// @route   POST /api/ai-chat/feedback
// @access  Private
exports.submitFeedback = async (req, res) => {
    try {
        const userId = req.user._id;
        const { chatId, messageIndex, rating, reason } = req.body || {};

        if (!chatId) {
            return res.status(400).json({ success: false, message: 'chatId is required' });
        }
        if (!['up', 'down'].includes(String(rating || ''))) {
            return res.status(400).json({ success: false, message: 'rating must be up or down' });
        }

        const chat = await Chat.findOne({ _id: chatId, participants: userId }).lean();
        if (!chat) {
            return res.status(404).json({ success: false, message: 'Chat not found' });
        }

        await AIUsage.create({
            userId,
            model: 'feedback',
            promptType: 'feedback',
            feedbackRating: rating,
            meta: {
                chatId: String(chatId),
                messageIndex: Number(messageIndex || 0),
                reason: String(reason || '')
            }
        });

        res.status(200).json({ success: true, message: 'Feedback recorded' });
    } catch (error) {
        console.error('Submit feedback error:', error);
        res.status(500).json({ success: false, message: 'Failed to record feedback' });
    }
};
