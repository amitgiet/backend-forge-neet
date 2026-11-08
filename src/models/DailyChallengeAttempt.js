const mongoose = require('mongoose');

const DailyChallengeAttemptSchema = new mongoose.Schema({
    challengeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DailyChallenge',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    dateIST: {
        type: String, // 'YYYY-MM-DD' in Asia/Kolkata
        required: true,
        index: true
    },
    score: {
        type: Number,
        required: true
    },
    maxScore: {
        type: Number,
        default: 40 // 10 questions * 4 marks
    },
    accuracy: {
        type: Number,
        required: true
    },
    timeTakenSeconds: {
        type: Number,
        default: 0
    },
    xpEarned: {
        type: Number,
        default: 50
    }
}, {
    timestamps: true
});

// A user can only complete a specific daily challenge once
DailyChallengeAttemptSchema.index({ challengeId: 1, userId: 1 }, { unique: true });
DailyChallengeAttemptSchema.index({ dateIST: 1, score: -1 });

module.exports = mongoose.model('DailyChallengeAttempt', DailyChallengeAttemptSchema);
