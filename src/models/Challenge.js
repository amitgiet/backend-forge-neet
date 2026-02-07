const mongoose = require('mongoose');

const challengeSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true
    },
    subject: {
        type: String,
        required: true,
        enum: ['physics', 'chemistry', 'biology']
    },
    topic: {
        type: String,
        required: true
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date,
        required: true
    },
    currentDay: {
        type: Number,
        default: 1,
        min: 1,
        max: 30
    },
    dailySchedule: [{
        day: {
            type: Number,
            required: true
        },
        lines: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'NCERTLine'
        }],
        completed: {
            type: Boolean,
            default: false
        },
        completedAt: Date,
        quizResults: [{
            lineId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'NCERTLine'
            },
            correctAnswers: Number,
            totalQuizzes: Number,
            timeSpent: Number
        }]
    }],
    streak: {
        type: Number,
        default: 0
    },
    totalLinesCompleted: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['active', 'completed', 'abandoned'],
        default: 'active'
    }
}, {
    timestamps: true
});

challengeSchema.index({ userId: 1, status: 1 });
challengeSchema.index({ userId: 1, subject: 1 });

module.exports = mongoose.model('Challenge', challengeSchema);
