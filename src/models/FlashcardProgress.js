const mongoose = require('mongoose');

const FlashcardProgressSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        cardId: {
            type: String,
            required: true,
            index: true,
        },
        chapterTitle: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        topicTitle: {
            type: String,
            trim: true,
            default: 'General',
        },
        status: {
            type: String,
            enum: ['unseen', 'learning', 'memorized', 'needs_revision', 'need_revision'],
            default: 'unseen',
            index: true,
        },
        isBookmarked: {
            type: Boolean,
            default: false,
            index: true,
        },
        easeFactor: {
            type: Number,
            default: 2.5,
            min: 1.3,
            max: 5.0,
        },
        intervalDays: {
            type: Number,
            default: 0,
            min: 0,
        },
        repetitions: {
            type: Number,
            default: 0,
            min: 0,
        },
        nextReviewDate: {
            type: Date,
            default: Date.now,
            index: true,
        },
        lastReviewedAt: {
            type: Date,
            default: Date.now,
        },
        lastCardIndex: {
            type: Number,
            default: 0,
        },
        totalReviews: {
            type: Number,
            default: 0,
        },
        lapseCount: {
            type: Number,
            default: 0,
        },
        lastQuality: {
            type: Number,
            default: null,
        },
        totalTimeSpentSeconds: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
        collection: 'flashcardprogresses',
    }
);

FlashcardProgressSchema.index({ userId: 1, cardId: 1 }, { unique: true });
FlashcardProgressSchema.index({ userId: 1, chapterTitle: 1, status: 1 });
FlashcardProgressSchema.index({ userId: 1, nextReviewDate: 1, status: 1 });
FlashcardProgressSchema.index({ userId: 1, isBookmarked: 1 });

module.exports = mongoose.model('FlashcardProgress', FlashcardProgressSchema);
