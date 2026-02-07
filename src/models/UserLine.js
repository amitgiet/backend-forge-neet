const mongoose = require('mongoose');

const UserLineSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    lineId: {
        type: String,
        required: true,
        ref: 'NCERTLine'
    },
    
    // NeuronZ 7-Level System for this line
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
    
    // Quiz session history for this line
    quizHistory: [{
        sessionDate: { type: Date, default: Date.now },
        quizzesAttempted: { type: Number, default: 4 }, // Always 4 micro-quizzes per session
        correctAnswers: { type: Number, required: true },
        accuracy: { type: Number }, // correctAnswers / quizzesAttempted * 100
        levelAfter: { type: Number, required: true },
        timeSpent: { type: Number }, // seconds for entire session
        isAdjustment: { type: Boolean, default: false }, // True if manually adjusted
        adjustmentReason: String // 'user-request', 'admin', 'boost', etc.
    }],
    
    // Total stats for this line
    totalSessions: { type: Number, default: 0 },
    totalQuizzesSolved: { type: Number, default: 0 },
    totalCorrectAnswers: { type: Number, default: 0 },
    overallAccuracy: { type: Number, default: 0 },
    
    // Mastery flag (L7 = mastered)
    isMastered: {
        type: Boolean,
        default: false
    },
    
    // Priority & Customization
    priority: {
        type: String,
        enum: ['low', 'normal', 'urgent'],
        default: 'normal'
    },
    
    customSchedule: {
        enabled: { type: Boolean, default: false },
        intervals: [Number] // Custom intervals in days, e.g., [1, 3, 7, 14, 21, 30, 45]
    },
    
    autoSkipL7: {
        type: Boolean,
        default: false // Auto-archive when reaching L7 (mastery)
    },
    
    // User selected this line
    selectedAt: {
        type: Date,
        default: Date.now
    }
    
}, {
    timestamps: true
});

// Compound index for efficient queries
UserLineSchema.index({ userId: 1, lineId: 1 }, { unique: true });
UserLineSchema.index({ userId: 1, nextRevision: 1 });
UserLineSchema.index({ userId: 1, level: 1 });

// NeuronZ Level Intervals (in hours)
const LEVEL_INTERVALS = [0, 24, 72, 120, 168, 240, 360, 720]; // L0-L7

// Calculate next revision date based on level
UserLineSchema.methods.getNextRevisionDate = function(level, lastReviewed = new Date()) {
    const hours = LEVEL_INTERVALS[level] || 24;
    return new Date(lastReviewed.getTime() + hours * 60 * 60 * 1000);
};

// Update line level after quiz session
UserLineSchema.methods.updateLevel = function(correctAnswers, totalQuizzes = 4, timeSpent = 0) {
    const accuracy = (correctAnswers / totalQuizzes) * 100;
    const wasSuccessful = accuracy >= 75; // 3/4 or better = success
    
    this.totalSessions += 1;
    this.totalQuizzesSolved += totalQuizzes;
    this.totalCorrectAnswers += correctAnswers;
    
    if (wasSuccessful) {
        this.streak += 1;
        // Advance level (max L7)
        this.level = Math.min(7, this.level + 1);
    } else {
        this.streak = 0;
        // Stay same level or drop 1 (min L1)
        this.level = Math.max(1, this.level - 1);
    }
    
    // Update dates
    this.lastReviewed = new Date();
    this.nextRevision = this.getNextRevisionDate(this.level, this.lastReviewed);
    
    // Mark as mastered if L7
    this.isMastered = (this.level === 7);
    
    // Calculate overall accuracy
    this.overallAccuracy = Math.round((this.totalCorrectAnswers / this.totalQuizzesSolved) * 100);
    
    // Add to history (keep last 10 sessions)
    this.quizHistory.push({
        sessionDate: this.lastReviewed,
        quizzesAttempted: totalQuizzes,
        correctAnswers,
        accuracy: Math.round(accuracy),
        levelAfter: this.level,
        timeSpent
    });
    
    if (this.quizHistory.length > 10) {
        this.quizHistory = this.quizHistory.slice(-10);
    }
    
    return this;
};

// Static method to get due lines for user
UserLineSchema.statics.getDueLines = async function(userId, limit = 50) {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    
    try {
        const lines = await this.find({
            userId,
            nextRevision: { $lte: today },
            level: { $gte: 1, $lte: 7 }
        })
        .populate({
            path: 'lineId',
            select: 'ncertText subject chapter class',
            options: { strictPopulate: false } // Don't throw error if lineId is invalid
        })
        .sort({ level: 1, streak: -1 }) // Easy first, then by streak
        .limit(limit);
        
        return lines;
    } catch (error) {
        console.error('Error in getDueLines:', error);
        // Fallback: return without populate if there's an error
        return this.find({
            userId,
            nextRevision: { $lte: today },
            level: { $gte: 1, $lte: 7 }
        })
        .sort({ level: 1, streak: -1 })
        .limit(limit);
    }
};

// Static method to create or update user line
UserLineSchema.statics.createOrUpdate = async function(userId, lineId, correctAnswers, totalQuizzes = 4, timeSpent = 0) {
    let userLine = await this.findOne({ userId, lineId });
    
    if (!userLine) {
        userLine = new this({
            userId,
            lineId,
            level: 1,
            nextRevision: new Date(Date.now() + 24 * 60 * 60 * 1000) // L1: +24h
        });
    }
    
    userLine.updateLevel(correctAnswers, totalQuizzes, timeSpent);
    return userLine.save();
};

module.exports = mongoose.model('UserLine', UserLineSchema);