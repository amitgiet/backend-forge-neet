const mongoose = require('mongoose');

const FlashcardSchema = new mongoose.Schema(
    {
        cardId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true,
        },
        sourceQuestionId: {
            type: String,
            sparse: true,
            index: true,
        },
        subjectTitle: {
            type: String,
            required: true,
            enum: ['biology', 'chemistry', 'physics'],
            lowercase: true,
            trim: true,
            index: true,
        },
        chapterTitle: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        topicTitle: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        subTopic: {
            type: String,
            trim: true,
            default: null,
        },
        ncertPageReference: {
            type: String,
            trim: true,
            default: null,
        },
        front: {
            prompt: {
                type: String,
                required: true,
                trim: true,
            },
            promptHi: {
                type: String,
                trim: true,
                default: null,
            },
            diagramUrl: {
                type: String,
                trim: true,
                default: null,
            },
            hint: {
                type: String,
                trim: true,
                default: null,
            },
        },
        back: {
            answer: {
                type: String,
                required: true,
                trim: true,
            },
            answerHi: {
                type: String,
                trim: true,
                default: null,
            },
            diagramUrl: {
                type: String,
                trim: true,
                default: null,
            },
            keyPoints: {
                type: [String],
                default: [],
            },
            neetTraps: {
                type: [String],
                default: [],
            },
            mnemonics: {
                type: String,
                trim: true,
                default: null,
            },
        },
        difficulty: {
            type: String,
            enum: ['easy', 'medium', 'hard'],
            default: 'medium',
            index: true,
        },
        isHighYield: {
            type: Boolean,
            default: true,
            index: true,
        },
        position: {
            type: Number,
            default: 0,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
    },
    {
        timestamps: true,
        collection: 'flashcards',
    }
);

FlashcardSchema.index({ subjectTitle: 1, chapterTitle: 1, position: 1 });
FlashcardSchema.index({ chapterTitle: 1, topicTitle: 1, position: 1 });
FlashcardSchema.index({ isActive: 1, isHighYield: 1 });

module.exports = mongoose.model('Flashcard', FlashcardSchema);
