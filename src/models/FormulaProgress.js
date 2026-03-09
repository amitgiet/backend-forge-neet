const mongoose = require('mongoose');

const FormulaProgressSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    cardId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FormulaCard',
        required: true,
        index: true
    },
    chapterTitle: {
        type: String,
        required: true,
        index: true
    },
    topicTitle: {
        type: String,
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['unseen', 'learning', 'memorized', 'need_revision'],
        default: 'unseen'
    },
    isBookmarked: {
        type: Boolean,
        default: false
    },
    lastSeenAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// A user can only have one progress record per card
FormulaProgressSchema.index({ userId: 1, cardId: 1 }, { unique: true });

module.exports = mongoose.model('FormulaProgress', FormulaProgressSchema);
