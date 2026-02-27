const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema({
    lineId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'NCERTLine',
        required: true,
        index: true
    },
    questions: [{
        question: { type: String, required: true },
        options: [{ type: String, required: true }],
        correctAnswer: { type: Number, required: true },
        explanation: String
    }],
    type: {
        type: String,
        enum: ['ai-generated', 'manual'],
        default: 'ai-generated'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

module.exports = mongoose.model('Quiz', quizSchema);
