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
        ref: 'Question'
    },
    
    // NeuronZ 7-Level System
    level: {
        type: Number,
        default: 1,
        min: 1,
        max: 7
    },
    
    nextRevision: {
        type: Date,
        default: function() {
            return new Date(Date.now() + 24 * 60 * 60 * 1000); // L1: +24 hours
        }
    },
    
    lastReviewed: {
        type: Date,
        default: Date.now
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
        timeSpent: { type: Number } // seconds
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
UserQuestionSchema.methods.getNextRevisionDate = function(level, lastReviewed = new Date()) {
    const hours = LEVEL_INTERVALS[level] || 24;
    return new Date(lastReviewed.getTime() + hours * 60 * 60 * 1000);
};

// Update question level after attempt
UserQuestionSchema.methods.updateLevel = function(wasCorrect, timeSpent = 0) {
    this.totalAttempts += 1;
    
    if (wasCorrect) {
        this.correctAttempts += 1;
        this.streak += 1;
        // Advance level (max L7)
        this.level = Math.min(7, this.level + 1);
    } else {
        this.streak = 0;
        // Stay same level or drop 1 (min L1)
        this.level = Math.max(1, this.level);
    }
    
    // Update dates
    this.lastReviewed = new Date();
    this.nextRevision = this.getNextRevisionDate(this.level, this.lastReviewed);
    
    // Mark as mastered if L7
    this.isMastered = (this.level === 7);
    
    // Add to history (keep last 7)
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
UserQuestionSchema.statics.getDueQuestions = async function(userId, limit = 50) {
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
UserQuestionSchema.statics.getUserProgress = async function(userId, questionId) {
    return this.findOne({ userId, questionId });
};

// Static method to create or update user question
UserQuestionSchema.statics.createOrUpdate = async function(userId, questionId, wasCorrect, timeSpent = 0) {
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

module.exports = mongoose.model('UserQuestion', UserQuestionSchema);