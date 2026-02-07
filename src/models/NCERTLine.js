const mongoose = require('mongoose');

const NCERTLineSchema = new mongoose.Schema({
    lineId: {
        type: String,
        required: true,
        unique: true
    },
    
    // NCERT Reference
    subject: {
        type: String,
        enum: ['physics', 'chemistry', 'biology', 'mathematics'],
        required: true
    },
    
    class: {
        type: Number,
        enum: [11, 12],
        required: true
    },
    
    chapter: {
        type: Number,
        required: true
    },
    
    pageNumber: {
        type: Number,
        required: true
    },
    
    lineNumber: {
        type: Number,
        required: true
    },
    
    // Line Content
    ncertText: {
        type: String,
        required: true,
        maxlength: 500
    },
    
    // Context for AI quiz generation
    context: {
        type: String,
        maxlength: 1000
    },
    
    // Generated micro-quizzes cache
    generatedQuizzes: [{
        question: { type: String, required: true },
        options: [{ type: String, required: true }],
        correctAnswer: { type: Number, required: true },
        explanation: { type: String },
        generatedAt: { type: Date, default: Date.now }
    }],
    
    // Metadata
    difficulty: {
        type: String,
        enum: ['easy', 'medium', 'hard'],
        default: 'medium'
    },
    
    conceptTags: [String],
    
    isActive: {
        type: Boolean,
        default: true
    }
    
}, {
    timestamps: true
});

// Indexes
NCERTLineSchema.index({ lineId: 1 });
NCERTLineSchema.index({ subject: 1, class: 1, chapter: 1 });
NCERTLineSchema.index({ conceptTags: 1 });

module.exports = mongoose.model('NCERTLine', NCERTLineSchema);