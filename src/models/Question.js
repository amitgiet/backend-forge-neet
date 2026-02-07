const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
    // Question identification
    questionId: {
        type: String,
        required: true,
        unique: true
    },

    // Content
    question: {
        en: { type: String, required: true },
        hi: { type: String }
    },

    // Options (for MCQ type)
    options: [{
        key: { type: String }, // A, B, C, D
        text: {
            en: { type: String },
            hi: { type: String }
        },
        isCorrect: { type: Boolean }
    }],

    // Correct answer (for MCQ quick reference)
    correctAnswer: String,

    // Explanation
    explanation: {
        en: { type: String, required: true },
        hi: { type: String }
    },

    // Video explanation (YouTube/custom)
    videoExplanation: {
        url: { type: String },
        duration: { type: Number }, // in seconds
        thumbnailUrl: { type: String }
    },

    // Classification
    subject: {
        type: String,
        enum: ['physics', 'chemistry', 'biology', 'mathematics'],
        required: true
    },

    chapterId: {
        type: String,
        required: true,
        ref: 'Chapter'
    },

    topicId: {
        type: String,
        ref: 'Topic'
    },

    conceptTags: [String], // Specific concepts tested

    // Exam mapping (multi-exam support)
    examTypes: [{
        type: String,
        enum: ['NEET_UG', 'JEE_MAIN', 'JEE_ADVANCED', 'BITSAT', 'AIIMS']
    }],

    // Difficulty
    difficulty: {
        type: String,
        enum: ['easy', 'medium', 'hard'],
        required: true
    },

    difficultyScore: {
        type: Number,
        min: 1,
        max: 10,
        default: 5
    },

    // Question type (5 scalable types)
    questionType: {
        type: String,
        enum: ['mcq', 'fill-blank', 'match', 'diagram-label', 'numeric'],
        default: 'mcq'
    },

    // Type-specific data (flexible for all 5 types)
    typeData: {
        // MCQ: { options: ['A', 'B', 'C', 'D'], correctIndex: 1 }
        // Fill-Blank: { template: 'Efficiency is ____%', correctAnswer: '25', caseSensitive: false }
        // Match: { leftItems: ['Chlorophyll', 'Carotene'], rightItems: ['Green', 'Orange'], correctPairs: [[0,0], [1,1]] }
        // Diagram-Label: { imageUrl: 'url', labels: [{id: 1, x: 10, y: 20, correctText: 'PS-I'}] }
        // Numeric: { question: 'ATP yield = ___', correctValue: 38, unit: 'ATP', tolerance: 0 }
        type: mongoose.Schema.Types.Mixed
    },

    // Previous Year Question (PYQ) data
    isPYQ: {
        type: Boolean,
        default: false
    },

    pyqData: {
        year: { type: Number },
        exam: { type: String },
        shift: { type: String },
        section: { type: String }
    },

    // NCERT reference
    ncertReference: {
        class: { type: Number, enum: [11, 12] },
        chapter: { type: Number },
        pageNumber: { type: Number },
        lineReference: { type: String }
    },

    // Statistics
    stats: {
        totalAttempts: { type: Number, default: 0 },
        correctAttempts: { type: Number, default: 0 },
        accuracy: { type: Number, default: 0 },
        avgTimeSpent: { type: Number, default: 0 }, // in seconds
        skipRate: { type: Number, default: 0 }
    },

    // Time estimate
    estimatedTime: {
        type: Number,
        default: 90 // seconds
    },

    // Quality flags
    isVerified: {
        type: Boolean,
        default: false
    },

    reportCount: {
        type: Number,
        default: 0
    },

    // Image/diagram URL (if applicable)
    imageUrl: String,

    // Status
    isActive: {
        type: Boolean,
        default: true
    },

    // Admin metadata
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes
QuestionSchema.index({ questionId: 1 });
QuestionSchema.index({ chapterId: 1, difficulty: 1 });
QuestionSchema.index({ subject: 1, examTypes: 1 });
QuestionSchema.index({ isPYQ: 1, 'pyqData.year': -1 });
QuestionSchema.index({ conceptTags: 1 });
QuestionSchema.index({ 'stats.accuracy': 1 });

// Virtual for chapter details
QuestionSchema.virtual('chapter', {
    ref: 'Chapter',
    localField: 'chapterId',
    foreignField: 'chapterId',
    justOne: true
});

// Method to update stats after attempt
QuestionSchema.methods.updateStats = function (isCorrect, timeSpent) {
    this.stats.totalAttempts += 1;
    if (isCorrect) {
        this.stats.correctAttempts += 1;
    }

    // Update accuracy
    this.stats.accuracy = Math.round(
        (this.stats.correctAttempts / this.stats.totalAttempts) * 100
    );

    // Update average time (running average)
    this.stats.avgTimeSpent = Math.round(
        ((this.stats.avgTimeSpent * (this.stats.totalAttempts - 1)) + timeSpent) /
        this.stats.totalAttempts
    );
};

// Static method to get random questions
QuestionSchema.statics.getRandomQuestions = async function (filters, limit = 20) {
    const { chapterId, subject, difficulty, examType } = filters;

    const query = { isActive: true };

    if (chapterId) query.chapterId = chapterId;
    if (subject) query.subject = subject;
    if (difficulty) query.difficulty = difficulty;
    if (examType) query.examTypes = examType;

    return this.aggregate([
        { $match: query },
        { $sample: { size: limit } }
    ]);
};

// Static method to get PYQs
QuestionSchema.statics.getPYQs = async function (filters, limit = 50) {
    const { subject, examType, year, chapterId } = filters;

    const query = { isPYQ: true, isActive: true };

    if (subject) query.subject = subject;
    if (examType) query['pyqData.exam'] = examType;
    if (year) query['pyqData.year'] = year;
    if (chapterId) query.chapterId = chapterId;

    return this.find(query)
        .sort({ 'pyqData.year': -1 })
        .limit(limit);
};

module.exports = mongoose.model('Question', QuestionSchema);
