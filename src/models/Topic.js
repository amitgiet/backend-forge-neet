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
    // Optional direct resource for this topic; chapter-level source is fallback
    contentSource: {
        en: {
            resourceType: {
                type: String,
                enum: ['pdf', 'text', 'html', 'external']
            },
            resourceUrl: {
                type: String,
                trim: true
            }
        },
        hi: {
            resourceType: {
                type: String,
                enum: ['pdf', 'text', 'html', 'external']
            },
            resourceUrl: {
                type: String,
                trim: true
            }
        },
        // Backward compatibility for previously stored single-shape contentSource
        resourceType: {
            type: String,
            enum: ['pdf', 'text', 'html', 'external']
        },
        resourceUrl: {
            type: String,
            trim: true
        }
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
