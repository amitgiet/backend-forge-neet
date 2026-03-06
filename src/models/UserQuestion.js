const mongoose = require('mongoose');

const UserQuestionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    questionId: {
        type: String,
        required: true,
        ref: 'ImportedQuestion'
    },

    // Where this question came from (curriculum browser)
    source: {
        subject: { type: String, default: null },
        chapterId: { type: String, default: null },
        topic: { type: String, default: null },
        subTopic: { type: String, default: null }
    },

    // NeuronZ 7-Level Spaced Repetition System
    level: {
        type: Number,
        default: 1,
        min: 1,
        max: 7
    },

    // nextRevision = date when this question is due again
    // On first enroll: now + 24h (not immediate)
    nextRevision: {
        type: Date,
        default: function () {
            return new Date(Date.now() + 24 * 60 * 60 * 1000); // L1: +24 hours
        }
    },

    lastReviewed: {
        type: Date,
        default: null
    },

    streak: {
        type: Number,
        default: 0
    },

    // Last 7 attempts history
    userHistory: [{
        date: { type: Date, default: Date.now },
        correct: { type: Boolean, required: true },
        levelAfter: { type: Number, required: true },
        timeSpent: { type: Number }
    }],

    // Quick stats
    totalAttempts: { type: Number, default: 0 },
    correctAttempts: { type: Number, default: 0 },

    // Mastery flag (L7 = mastered)
    isMastered: {
        type: Boolean,
        default: false
    }

}, {
    timestamps: true
});

// Compound index for efficient queries
UserQuestionSchema.index({ userId: 1, questionId: 1 }, { unique: true });
UserQuestionSchema.index({ userId: 1, nextRevision: 1 });
UserQuestionSchema.index({ userId: 1, level: 1 });

// NeuronZ Level Intervals (in hours)
const LEVEL_INTERVALS = [0, 24, 72, 120, 168, 240, 360, 720]; // L0-L7

// Calculate next revision date based on level
UserQuestionSchema.methods.getNextRevisionDate = function (level, lastReviewed = new Date()) {
    const hours = LEVEL_INTERVALS[level] || 24;
    return new Date(lastReviewed.getTime() + hours * 60 * 60 * 1000);
};

// Update question level after a NeuronZ review attempt
// Correct   → advance one level (max L7)
// Incorrect → STAY at same level (no drop, per NeuronZ spec)
UserQuestionSchema.methods.updateLevel = function (wasCorrect, timeSpent = 0) {
    this.totalAttempts += 1;

    if (wasCorrect) {
        this.correctAttempts += 1;
        this.streak += 1;
        this.level = Math.min(7, this.level + 1);
    } else {
        this.streak = 0;
        // Stay at same level — no drop
        this.level = Math.max(1, this.level);
    }

    this.lastReviewed = new Date();
    this.nextRevision = this.getNextRevisionDate(this.level, this.lastReviewed);
    this.isMastered = (this.level === 7);

    this.userHistory.push({
        date: this.lastReviewed,
        correct: wasCorrect,
        levelAfter: this.level,
        timeSpent
    });

    if (this.userHistory.length > 7) {
        this.userHistory = this.userHistory.slice(-7);
    }

    return this;
};

// Static method to get due questions for user
UserQuestionSchema.statics.getDueQuestions = async function (userId, limit = 50) {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today

    return this.find({
        userId,
        nextRevision: { $lte: today },
        level: { $gte: 1, $lte: 7 }
    })
        .populate('questionId')
        .sort({ level: 1, streak: -1 }) // Easy first, then by streak
        .limit(limit);
};

// Static method to get user's question progress
UserQuestionSchema.statics.getUserProgress = async function (userId, questionId) {
    return this.findOne({ userId, questionId });
};

// Static method to create or update user question
UserQuestionSchema.statics.createOrUpdate = async function (userId, questionId, wasCorrect, timeSpent = 0) {
    let userQuestion = await this.findOne({ userId, questionId });

    if (!userQuestion) {
        userQuestion = new this({
            userId,
            questionId,
            level: 1,
            nextRevision: new Date(Date.now() + 24 * 60 * 60 * 1000) // L1: +24h
        });
    }

    userQuestion.updateLevel(wasCorrect, timeSpent);
    return userQuestion.save();
};

/**
 * Bulk-enroll answered question UIDs into NeuronZ at Level 1.
 * Only creates new records — does NOT overwrite existing progress.
 * nextRevision = now + 24h so questions appear after 24 hours (not immediately).
 */
UserQuestionSchema.statics.bulkEnroll = async function (userId, uids = [], sourceInfo = {}) {
    if (!uids || uids.length === 0) return { enrolled: 0 };

    const userObjectId = new require('mongoose').Types.ObjectId(userId);
    const nextRevision = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24h

    const ops = uids.map((uid) => ({
        updateOne: {
            filter: { userId: userObjectId, questionId: String(uid) },
            update: {
                $setOnInsert: {
                    userId: userObjectId,
                    questionId: String(uid),
                    source: {
                        subject: sourceInfo.subject || null,
                        chapterId: sourceInfo.chapterId || null,
                        topic: sourceInfo.topic || null,
                        subTopic: sourceInfo.subTopic || null
                    },
                    level: 1,
                    nextRevision,
                    lastReviewed: null,
                    streak: 0,
                    totalAttempts: 0,
                    correctAttempts: 0,
                    isMastered: false,
                    userHistory: []
                }
            },
            upsert: true
        }
    }));

    const result = await require('mongoose').model('UserQuestion').bulkWrite(ops, { ordered: false });
    return { enrolled: result.upsertedCount || 0, existing: result.matchedCount || 0 };
};

module.exports = mongoose.model('UserQuestion', UserQuestionSchema);