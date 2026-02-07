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
        date: {
            type: Date,
            required: true
        },
        quizzes: [{
            lineId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'NCERTLine'
            },
            quizCount: {
                type: Number,
                default: 4
            },
            questions: [{
                question: String,
                options: [String],
                correctAnswer: Number,
                explanation: String
            }],
            isCompleted: {
                type: Boolean,
                default: false
            },
            completedAt: Date,
            score: Number,
            timeSpent: Number
        }],
        targetQuizzes: {
            type: Number,
            default: 4
        },
        completedQuizzes: {
            type: Number,
            default: 0
        },
        isUnlocked: {
            type: Boolean,
            default: false
        },
        isCompleted: {
            type: Boolean,
            default: false
        },
        completedAt: Date
    }],
    progress: {
        currentDay: {
            type: Number,
            default: 1
        },
        completedDays: {
            type: Number,
            default: 0
        },
        totalQuizzes: {
            type: Number,
            default: 0
        },
        completedQuizzes: {
            type: Number,
            default: 0
        },
        averageScore: {
            type: Number,
            default: 0
        },
        streak: {
            type: Number,
            default: 0
        }
    },
    duration: {
        type: Number,
        default: 30
    },
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
