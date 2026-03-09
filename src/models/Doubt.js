const mongoose = require('mongoose');

/**
 * Doubt.js — Community Doubt Forum
 * Users can post doubts, get answers, upvote, and mark as resolved.
 */
const answerSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    imageUrl: { type: String, default: '' },
    upvotes: { type: Number, default: 0 },
    upvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isVerified: { type: Boolean, default: false },  // admin/expert verified
    isAccepted: { type: Boolean, default: false },  // accepted by doubt author
}, { timestamps: true });

const doubtSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    body: { type: String, required: true, trim: true, maxlength: 8000 },
    imageUrl: { type: String, default: '' },

    // Classification
    subject: {
        type: String,
        enum: ['biology', 'chemistry', 'physics', 'general'],
        default: 'general',
        index: true,
    },
    chapterId: { type: String, default: '', index: true },
    topic: { type: String, default: '' },
    tags: [{ type: String, maxlength: 50 }],

    // Engagement
    answers: [answerSchema],
    upvotes: { type: Number, default: 0 },
    upvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    views: { type: Number, default: 0 },

    // Status
    isResolved: { type: Boolean, default: false, index: true },
    isHidden: { type: Boolean, default: false },  // admin moderation

}, { timestamps: true });

// Compound indexes for common queries
doubtSchema.index({ subject: 1, isResolved: 1, createdAt: -1 });
doubtSchema.index({ userId: 1, createdAt: -1 });
doubtSchema.index({ chapterId: 1, createdAt: -1 });

module.exports = mongoose.model('Doubt', doubtSchema);
