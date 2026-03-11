const mongoose = require('mongoose');

const ToppersResourceLogSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        chapterId: {
            type: String,
            required: true,
            index: true,
        },
        subject: {
            type: String,
            enum: ['biology', 'chemistry', 'physics'],
            index: true,
        },
        resourceType: {
            type: String,
            enum: ['video', 'audio', 'slides', 'mindmap', 'report', 'infographic', 'flashcards'],
            required: true,
        },
        durationSeconds: {
            type: Number,
            default: 0,
            min: 0,
        },
        viewedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
    },
    {
        timestamps: true,
        collection: 'toppersresourcelogs',
    }
);

ToppersResourceLogSchema.index({ userId: 1, viewedAt: -1 });
ToppersResourceLogSchema.index({ userId: 1, chapterId: 1, resourceType: 1 });

module.exports = mongoose.model('ToppersResourceLog', ToppersResourceLogSchema);
