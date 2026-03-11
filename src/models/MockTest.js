const mongoose = require('mongoose');

const MockTestSchema = new mongoose.Schema({
    // Test identification
    testId: {
        type: String,
        required: true,
        unique: true
    },

    title: {
        en: { type: String, required: true },
        hi: { type: String }
    },

    description: {
        en: { type: String },
        hi: { type: String }
    },

    // Exam classification
    examType: {
        type: String,
        enum: ['NEET_UG', 'JEE_MAIN', 'JEE_ADVANCED', 'BITSAT', 'AIIMS'],
        required: true
    },

    // Test type
    testType: {
        type: String,
        enum: ['FULL_TEST', 'SUBJECT_TEST', 'CHAPTER_TEST', 'PYQ_TEST', 'CUSTOM'],
        required: true
    },

    // Test configuration
    config: {
        totalQuestions: { type: Number, required: true },
        totalMarks: { type: Number, required: true },
        duration: { type: Number, required: true }, // in minutes

        // Marking scheme
        marksPerCorrect: { type: Number, default: 4 },
        marksPerIncorrect: { type: Number, default: -1 },
        marksPerUnattempted: { type: Number, default: 0 },

        // Section-wise breakdown
        sections: [{
            name: { type: String, required: true }, // Physics, Chemistry, Biology
            subject: { type: String, required: true },
            questionsCount: { type: Number, required: true },
            startQuestionNo: { type: Number },
            endQuestionNo: { type: Number }
        }]
    },

    // Questions (references)
    questions: [{
        questionId: {
            type: String,
            ref: 'Question',
            required: true
        },
        questionNumber: { type: Number, required: true },
        section: { type: String },
        chapterId: { type: String }
    }],

    // Chapter mapping (for weakness analysis)
    chapterMapping: [{
        chapterId: { type: String, required: true },
        subject: { type: String, required: true },
        questionNumbers: [Number],
        totalMarks: { type: Number }
    }],

    // Difficulty distribution
    difficultyDistribution: {
        easy: { type: Number, default: 0 },
        medium: { type: Number, default: 0 },
        hard: { type: Number, default: 0 }
    },

    // Access control
    accessType: {
        type: String,
        enum: ['FREE', 'PRO', 'ULTIMATE'],
        default: 'FREE'
    },

    // Scheduling
    isScheduled: {
        type: Boolean,
        default: false
    },

    scheduledAt: Date,

    // Test availability
    isActive: {
        type: Boolean,
        default: true
    },

    isLive: {
        type: Boolean,
        default: false
    },

    // Test window (for live tests)
    startTime: Date,
    endTime: Date,

    // Tags & metadata
    tags: [String],

    institution: {
        type: String,
        enum: ['Allen', 'Aakash', 'FIITJEE', 'Resonance', 'NTA', 'Custom']
    },

    sourceType: {
        type: String,
        default: ''
    },

    year: Number, // For PYQ tests

    // Imported test-series metadata
    source: {
        provider: { type: String, default: 'Custom' },
        externalId: String,
        originalTestType: String,
        testFor: [String], // e.g. ['11','12','dropper','neet24']
        isFree: { type: Boolean, default: true },
        isHidden: { type: Boolean, default: false },
        index: Number,
        rawRef: { type: mongoose.Schema.Types.ObjectId },

        // Preserve the original imported record so we don't lose fields over time
        raw: mongoose.Schema.Types.Mixed
    },

    // Convenience field for UI filtering
    classCategory: {
        type: String,
        enum: ['11', '12', 'dropper', 'mixed', 'other'],
        default: 'other'
    },

    // High-level series grouping (e.g. "sigma", "yakeen 2.0", "yakeen 3.0 (hindi)")
    seriesType: {
        type: String,
        default: ''
    },
    seriesId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TestSeries'
    },

    // Hierarchical reference links to Normalized Models
    testSeriesDetails: {
        subjectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TestSeriesSubject' }],
        chapterIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TestSeriesChapter' }],
        topicIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TestSeriesTopic' }]
    },
    facets: {
        subjectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TestSeriesSubject' }],
        chapterIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TestSeriesChapter' }],
        topicIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TestSeriesTopic' }]
    },
    taxonomyStatus: {
        type: String,
        enum: ['complete', 'partial', 'unmapped'],
        default: 'unmapped'
    },

    // Syllabus/taxonomy metadata imported from uploads/TestSeries.json
    taxonomy: {
        subjectNames: [String],
        chapterNames: [String],
        topicNames: [String],
        chapterIds: [Number],
        chapterTopicsMap: mongoose.Schema.Types.Mixed
    },

    // External resources
    resources: {
        questionPdf: String,
        answerPdf: String,
        hindiQuestionPdf: String,
        hindiAnswerPdf: String,
        lectures: [String]
    },

    // Statistics
    stats: {
        totalAttempts: { type: Number, default: 0 },
        avgScore: { type: Number, default: 0 },
        avgPercentage: { type: Number, default: 0 },
        highestScore: { type: Number, default: 0 },
        lowestScore: { type: Number, default: 0 },
        avgTimeSpent: { type: Number, default: 0 }
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
MockTestSchema.index({ examType: 1, testType: 1 });
MockTestSchema.index({ accessType: 1, isActive: 1 });
MockTestSchema.index({ isLive: 1, scheduledAt: -1 });
MockTestSchema.index({ tags: 1 });
MockTestSchema.index({ classCategory: 1, isActive: 1 });
MockTestSchema.index({ seriesType: 1, isActive: 1 });
MockTestSchema.index({ 'source.testFor': 1 });
MockTestSchema.index({ seriesId: 1, isActive: 1 });
MockTestSchema.index({ institution: 1, seriesType: 1, isActive: 1 });
MockTestSchema.index({ taxonomyStatus: 1, isActive: 1 });
MockTestSchema.index(
    { 'source.provider': 1, 'source.externalId': 1 },
    {
        unique: true,
        partialFilterExpression: {
            'source.provider': { $exists: true },
            'source.externalId': { $exists: true }
        }
    }
);

// Fast-lookup Indexes for the new references
MockTestSchema.index({ 'testSeriesDetails.subjectIds': 1 });
MockTestSchema.index({ 'testSeriesDetails.chapterIds': 1 });
MockTestSchema.index({ 'testSeriesDetails.topicIds': 1 });
MockTestSchema.index({ 'facets.subjectIds': 1 });
MockTestSchema.index({ 'facets.chapterIds': 1 });
MockTestSchema.index({ 'facets.topicIds': 1 });

// Virtual for attempt count
MockTestSchema.virtual('attempts', {
    ref: 'TestAttempt',
    localField: 'testId',
    foreignField: 'testId',
    count: true
});

// Method to update stats
MockTestSchema.methods.updateStats = function (score, percentage, timeSpent) {
    const total = this.stats.totalAttempts + 1;

    this.stats.totalAttempts = total;
    this.stats.avgScore = Math.round(
        ((this.stats.avgScore * (total - 1)) + score) / total
    );
    this.stats.avgPercentage = Math.round(
        ((this.stats.avgPercentage * (total - 1)) + percentage) / total
    );
    this.stats.avgTimeSpent = Math.round(
        ((this.stats.avgTimeSpent * (total - 1)) + timeSpent) / total
    );

    if (score > this.stats.highestScore) {
        this.stats.highestScore = score;
    }

    if (this.stats.lowestScore === 0 || score < this.stats.lowestScore) {
        this.stats.lowestScore = score;
    }
};

// Static method to get tests by exam type
MockTestSchema.statics.getTestsByExam = async function (examType, testType, accessLevel) {
    const query = { examType, isActive: true };

    if (testType) query.testType = testType;

    // Access control
    const accessTypes = ['FREE'];
    if (accessLevel === 'pro' || accessLevel === 'ultimate') {
        accessTypes.push('PRO');
    }
    if (accessLevel === 'ultimate') {
        accessTypes.push('ULTIMATE');
    }

    query.accessType = { $in: accessTypes };

    return this.find(query).sort({ createdAt: -1 });
};

module.exports = mongoose.model('MockTest', MockTestSchema);
