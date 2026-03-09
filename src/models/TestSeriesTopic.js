const mongoose = require('mongoose');

const TestSeriesTopicSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    chapterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TestSeriesChapter',
        required: true
    }
}, {
    timestamps: true
});

// Ensure a topic is unique within a chapter
TestSeriesTopicSchema.index({ name: 1, chapterId: 1 }, { unique: true });

module.exports = mongoose.model('TestSeriesTopic', TestSeriesTopicSchema);
