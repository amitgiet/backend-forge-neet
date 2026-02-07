const mongoose = require('mongoose');

const StudySessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    subject: {
        type: String,
        enum: ['physics', 'chemistry', 'biology'],
        required: true
    },
    chapterId: String,
    topicId: String,
    startTime: {
        type: Date,
        default: Date.now
    },
    endTime: Date,
    duration: Number, // In minutes
    focusMode: {
        type: Boolean,
        default: false
    },
    pomodoroCount: {
        type: Number,
        default: 0
    },
    questionsSolved: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['IN_PROGRESS', 'COMPLETED', 'INTERRUPTED'],
        default: 'IN_PROGRESS'
    }
}, {
    timestamps: true
});

StudySessionSchema.index({ userId: 1, startTime: -1 });

module.exports = mongoose.model('StudySession', StudySessionSchema);
