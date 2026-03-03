const mongoose = require('mongoose');

const ImportedSubtopicAttemptSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        subject: {
            type: String,
            required: true,
            enum: ['biology', 'chemistry', 'physics'],
            index: true,
        },
        chapterId: {
            type: String,
            required: true,
            index: true,
        },
        topic: {
            type: String,
            required: true,
            index: true,
        },
        subTopic: {
            type: String,
            required: true,
            index: true,
        },
        mode: {
            type: String,
            enum: ['practice', 'test'],
            default: 'practice',
        },
        totalQuestions: {
            type: Number,
            required: true,
            min: 1,
        },
        correctAnswers: {
            type: Number,
            required: true,
            min: 0,
        },
        percentage: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
        },
        timeTaken: {
            type: Number,
            default: 0,
            min: 0,
        },
        uids: {
            type: [Number],
            default: [],
        },
        attemptedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
    },
    {
        timestamps: true,
        collection: 'importedsubtopicattempts',
    }
);

ImportedSubtopicAttemptSchema.index({
    userId: 1,
    subject: 1,
    chapterId: 1,
    topic: 1,
    subTopic: 1,
    attemptedAt: -1,
});

module.exports = mongoose.model('ImportedSubtopicAttempt', ImportedSubtopicAttemptSchema);
