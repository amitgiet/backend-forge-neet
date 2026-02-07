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
