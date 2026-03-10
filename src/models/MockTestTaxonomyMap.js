const mongoose = require('mongoose');

const MockTestTaxonomyMapSchema = new mongoose.Schema({
    testId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MockTest',
        required: true
    },
    seriesId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TestSeries'
    },
    subjectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TestSeriesSubject'
    },
    chapterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TestSeriesChapter'
    },
    topicId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TestSeriesTopic'
    },
    sourceChapterId: Number,
    sourceTopicName: String,
    confidence: {
        type: String,
        enum: ['exact', 'alias', 'inferred', 'unknown'],
        default: 'exact'
    },
    provider: {
        type: String,
        default: 'Custom'
    },
    examType: {
        type: String,
        default: 'NEET_UG'
    }
}, {
    timestamps: true
});

MockTestTaxonomyMapSchema.index(
    { testId: 1, subjectId: 1, chapterId: 1, topicId: 1 },
    { unique: true }
);
MockTestTaxonomyMapSchema.index({ subjectId: 1, chapterId: 1, topicId: 1, testId: 1 });
MockTestTaxonomyMapSchema.index({ chapterId: 1, testId: 1 });
MockTestTaxonomyMapSchema.index({ topicId: 1, testId: 1 });
MockTestTaxonomyMapSchema.index({ seriesId: 1, testId: 1 });
MockTestTaxonomyMapSchema.index({ provider: 1, examType: 1 });

module.exports = mongoose.model('MockTestTaxonomyMap', MockTestTaxonomyMapSchema);

