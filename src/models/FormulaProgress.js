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
        required: true
    },
    status: {
        type: String,
        enum: ['unseen', 'learning', 'memorized', 'need_revision'],
        default: 'unseen',
        index: true
    },
    // SuperMemo-2 (SM-2) Spaced Repetition Fields
    easeFactor: {
        type: Number,
        default: 2.5,
        min: 1.3
    },
    intervalDays: {
        type: Number,
        default: 0
    },
    repetitions: {
        type: Number,
        default: 0
    },
    nextReviewDate: {
        type: Date,
        default: Date.now,
        index: true
    },
    isBookmarked: {
        type: Boolean,
        default: false
    },
    lastReviewedAt: {
        type: Date,
        default: Date.now
    },
    lastCardIndex: {
        type: Number,
        default: 0
    },
    lastStudiedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Compound Indexes for < 25ms queries
FormulaProgressSchema.index({ userId: 1, cardId: 1 }, { unique: true });
FormulaProgressSchema.index({ userId: 1, chapterTitle: 1, status: 1 });
FormulaProgressSchema.index({ userId: 1, nextReviewDate: 1 });

module.exports = mongoose.model('FormulaProgress', FormulaProgressSchema);
