const mongoose = require('mongoose');

const testSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },

    type: {
        type: String,
        required: true,
        enum: [
            'full-length-mock',    // Full NEET mock (200Q, 180min)
            'full-length-cbt',     // CBT simulation
            'custom-part',         // User-selected chapters
            'ncert-focus',         // NCERT-only questions
            'chapter-wise',        // Single chapter
            'subject-specific'     // Single subject
        ]
    },

    // Configuration
    config: {
        duration: {
            type: Number,
            required: true // in minutes
        },
        totalQuestions: {
            type: Number,
            required: true
        },
        subjects: [{
            type: String,
            enum: ['Physics', 'Chemistry', 'Biology']
        }],
        chapters: [String],
        difficulty: {
            type: String,
            enum: ['easy', 'medium', 'hard', 'mixed'],
            default: 'mixed'
        },
        ncertOnly: {
            type: Boolean,
            default: false
        },
        negativeMarking: {
            type: Boolean,
            default: true
        },
        marksPerQuestion: {
            type: Number,
            default: 4
        },
        negativeMarks: {
            type: Number,
            default: -1
        }
    },

    // Question Distribution (for full-length tests)
    distribution: {
        physics: Number,
        chemistry: Number,
        biology: Number
    },

    // Questions (populated dynamically or stored)
    questions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question'
    }],

    // Metadata
    createdBy: {
        type: String,
        default: 'system' // 'system' or 'admin'
    },

    isActive: {
        type: Boolean,
        default: true
    },

    isPremium: {
        type: Boolean,
        default: false
    },

    tags: [String],

    // Stats
    totalAttempts: {
        type: Number,
        default: 0
    },

    avgScore: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Indexes
testSchema.index({ type: 1, isActive: 1 });
testSchema.index({ 'config.subjects': 1 });
testSchema.index({ tags: 1 });

module.exports = mongoose.model('Test', testSchema);