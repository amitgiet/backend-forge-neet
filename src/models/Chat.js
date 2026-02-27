const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['direct', 'group'],
        required: true
    },
    
    name: {
        type: String,
        required: function() { return this.type === 'group'; }
    },
    
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    
    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    messages: [{
        sender: { type: String, enum: ['user', 'ai'], default: 'user' },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
    }],

    // Rolling memory for AI chats (optional; safe for non-AI chats too)
    summary: {
        type: String,
        default: ''
    },

    messagesSinceSummary: {
        type: Number,
        default: 0
    },

    summaryUpdatedAt: {
        type: Date
    },
    
    lastMessage: {
        text: String,
        sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        timestamp: Date
    },
    
    isActive: {
        type: Boolean,
        default: true
    }
    
}, {
    timestamps: true
});

ChatSchema.index({ participants: 1 });
ChatSchema.index({ type: 1, isActive: 1 });

module.exports = mongoose.model('Chat', ChatSchema);
