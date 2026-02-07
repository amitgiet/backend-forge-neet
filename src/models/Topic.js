const mongoose = require('mongoose');

const TopicSchema = new mongoose.Schema({
    topicId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    name: {
        en: { type: String, required: true },
        hi: { type: String }
    },
    chapterId: {
        type: String,
        required: true,
        ref: 'Chapter'
    },
    subject: {
        type: String,
        enum: ['physics', 'chemistry', 'biology'],
        required: true
    },
    importance: {
        type: String,
        enum: ['High', 'Medium', 'Low'],
        default: 'Medium'
    },
    ncertReference: {
        pageNumber: Number,
        lineRange: String
    },
    stats: {
        totalQuestions: { type: Number, default: 0 },
        avgAccuracy: { type: Number, default: 0 }
    }
}, {
    timestamps: true
});

TopicSchema.index({ chapterId: 1 });
TopicSchema.index({ topicId: 1 });

module.exports = mongoose.model('Topic', TopicSchema);
