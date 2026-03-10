const mongoose = require('mongoose');

const normalizeName = (value) =>
    String(value || '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const TestSeriesTopicSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    normalizedName: {
        type: String,
        index: true
    },
    aliases: [String],
    chapterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TestSeriesChapter',
        required: true
    }
}, {
    timestamps: true
});

TestSeriesTopicSchema.pre('validate', function (next) {
    if (!this.normalizedName) {
        this.normalizedName = normalizeName(this.name);
    }
    next();
});

// Ensure a topic is unique within a chapter
TestSeriesTopicSchema.index({ name: 1, chapterId: 1 }, { unique: true });
TestSeriesTopicSchema.index({ chapterId: 1, normalizedName: 1 });

module.exports = mongoose.model('TestSeriesTopic', TestSeriesTopicSchema);
