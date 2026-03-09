const mongoose = require('mongoose');

const TestSeriesChapterSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    originalId: {
        type: Number
    },
    subjectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TestSeriesSubject',
        required: true
    }
}, {
    timestamps: true
});

// Ensure a chapter is unique within a subject
TestSeriesChapterSchema.index({ name: 1, subjectId: 1 }, { unique: true });

module.exports = mongoose.model('TestSeriesChapter', TestSeriesChapterSchema);
