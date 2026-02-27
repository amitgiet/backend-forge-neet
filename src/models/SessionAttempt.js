const mongoose = require('mongoose');

const SessionAttemptSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // Reference to the content being quizzed
    lineId: {
        type: String,
        ref: 'NCERTLine'
    },
    
    topicId: String, // For topic-level tracking
    chapterId: String, // For chapter-level tracking
    
    // Type differentiator: what kind of session was this
    type: {
        type: String,
        enum: ['revision', 'challenge', 'mock', 'practice', 'topic-baseline'],
        default: 'revision'
    },
    
    // Reference to parent (challenge, mock test, etc)
    parentId: String, // challengeId, mockTestId, etc
    
    // Quiz session details
    sessionDate: { type: Date, default: Date.now },
    
    // Quiz results
    quizzesAttempted: { type: Number, default: 4 },
    correctAnswers: { type: Number, required: true },
    accuracy: { type: Number }, // correctAnswers / quizzesAttempted * 100
    timeSpent: { type: Number }, // seconds
    
    // Level progression (for revision type)
    levelBefore: Number,
    levelAfter: Number,
    isMastered: Boolean,
    
    // Full quiz review with individual question details
    review: [{
        question: String,
        options: [String],
        selectedAnswer: { type: Number, default: null }, // User's answer index
        correctAnswer: Number, // Correct answer index
        explanation: String
    }],
    
    // Metadata
    isAdjustment: { type: Boolean, default: false }, // Manual adjustment
    adjustmentReason: String, // 'user-request', 'admin', 'boost', etc
    notes: String,
    
    // Next revision date (if applicable)
    nextRevision: Date
    
}, {
    timestamps: true
});

// Indexes for efficient queries
SessionAttemptSchema.index({ userId: 1, sessionDate: -1 });
SessionAttemptSchema.index({ userId: 1, type: 1, sessionDate: -1 });
SessionAttemptSchema.index({ userId: 1, lineId: 1, sessionDate: -1 });
SessionAttemptSchema.index({ userId: 1, topicId: 1, sessionDate: -1 });
SessionAttemptSchema.index({ userId: 1, parentId: 1 }); // For challenge/mock tracking

module.exports = mongoose.model('SessionAttempt', SessionAttemptSchema);
