const mongoose = require('mongoose');

const normalizeName = (value) =>
    String(value || '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const TestSeriesChapterSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    normalizedName: {
        type: String,
        index: true
    },
    originalId: {
        type: Number
    },
    aliases: [String],
    subjectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TestSeriesSubject',
        required: true
    }
}, {
    timestamps: true
});

TestSeriesChapterSchema.pre('validate', function (next) {
    if (!this.normalizedName) {
        this.normalizedName = normalizeName(this.name);
    }
    next();
});

// Ensure a chapter is unique within a subject
TestSeriesChapterSchema.index({ name: 1, subjectId: 1 }, { unique: true });
TestSeriesChapterSchema.index({ subjectId: 1, normalizedName: 1 });
TestSeriesChapterSchema.index({ originalId: 1, subjectId: 1 });

module.exports = mongoose.model('TestSeriesChapter', TestSeriesChapterSchema);
