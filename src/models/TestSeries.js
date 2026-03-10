const mongoose = require('mongoose');

const normalizeName = (value) =>
    String(value || '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const TestSeriesSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    normalizedName: {
        type: String,
        index: true
    },
    provider: {
        type: String,
        default: 'Custom'
    },
    examType: {
        type: String,
        enum: ['NEET_UG', 'JEE_MAIN', 'JEE_ADVANCED', 'BITSAT', 'AIIMS'],
        default: 'NEET_UG'
    },
    language: {
        type: String,
        default: 'en'
    },
    seriesType: {
        type: String,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },
    metadata: {
        classTargets: [String],
        description: String
    },
    stats: {
        testsCount: { type: Number, default: 0 },
        subjectsCount: { type: Number, default: 0 },
        chaptersCount: { type: Number, default: 0 },
        topicsCount: { type: Number, default: 0 }
    }
}, {
    timestamps: true
});

TestSeriesSchema.pre('validate', function (next) {
    if (!this.normalizedName) {
        this.normalizedName = normalizeName(this.name);
    }
    next();
});

TestSeriesSchema.index(
    { provider: 1, examType: 1, language: 1, normalizedName: 1 },
    { unique: true }
);
TestSeriesSchema.index({ provider: 1, seriesType: 1, isActive: 1 });

module.exports = mongoose.model('TestSeries', TestSeriesSchema);

