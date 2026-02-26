const mongoose = require('mongoose');

const NcertTopicQuizAttemptSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    topicObjectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Topic',
        required: true,
        index: true
    },
    topicId: {
        type: String,
        required: true,
        index: true
    },
    chapterId: {
        type: String,
        required: true,
        index: true
    },
    subject: {
        type: String,
        enum: ['physics', 'chemistry', 'biology', 'mathematics'],
        required: true
    },
    sourceType: {
        type: String,
        enum: ['topic', 'chapter'],
        required: true
    },
    totalQuestions: {
        type: Number,
        required: true
    },
    correctAnswers: {
        type: Number,
        required: true
    },
    scorePercent: {
        type: Number,
        required: true
    },
    timeTaken: {
        type: Number,
        default: 0
    },
    answers: [{
        questionId: { type: String, required: true },
        selectedOption: { type: String, default: null },
        isCorrect: { type: Boolean, required: true }
    }]
}, {
    timestamps: true
});

NcertTopicQuizAttemptSchema.index({ userId: 1, topicObjectId: 1, createdAt: -1 });
NcertTopicQuizAttemptSchema.index({ userId: 1, chapterId: 1, createdAt: -1 });

module.exports = mongoose.model('NcertTopicQuizAttempt', NcertTopicQuizAttemptSchema);
