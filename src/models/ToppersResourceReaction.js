const mongoose = require('mongoose');

const ToppersResourceReactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    chapterId: {
        type: String,
        required: true,
        index: true
    },
    resourceType: {
        type: String,
        enum: ['video', 'audio', 'slides', 'infographic', 'report', 'mindmap', 'flashcards'],
        required: true
    },
    reaction: {
        type: String,
        enum: ['like', 'dislike', 'none'],
        required: true,
        default: 'none'
    }
}, { timestamps: true });

// Ensure one reaction per user per resource
ToppersResourceReactionSchema.index({ userId: 1, chapterId: 1, resourceType: 1 }, { unique: true });

module.exports = mongoose.model('ToppersResourceReaction', ToppersResourceReactionSchema);
