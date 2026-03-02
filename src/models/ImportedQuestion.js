const mongoose = require('mongoose');

const ImportedQuestionSchema = new mongoose.Schema(
    {
        // The original numeric ID from the IndexedDB export (e.g. "10101", "1", "3")
        questionId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        question: {
            type: String,
            default: null,
        },

        // The plain-text correct answer
        correct_answer: {
            type: String,
            default: null,
        },

        // Derived letter: "A" | "B" | "C" | "D"
        correct_option: {
            type: String,
            enum: ['A', 'B', 'C', 'D', null],
            default: null,
        },

        options: {
            A: { type: String, default: null },
            B: { type: String, default: null },
            C: { type: String, default: null },
            D: { type: String, default: null },
        },

        explanation: {
            type: String,
            default: null,
        },

        // e.g. "Physical chemistry >> Some basic concepts of chemistry >> Development of Chemistry"
        source: {
            type: String,
            default: null,
        },

        // Question type: "mcq" etc.
        type: {
            type: String,
            default: 'mcq',
        },

        // "NEW" | "DELETED" | "UPDATED"
        status: {
            type: String,
            default: 'NEW',
        },

        // Chapter range codes (e.g. "11-001")
        chapter_start: {
            type: String,
            default: null,
            index: true,
        },

        chapter_end: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'importedquestions',
    }
);

// Compound indexes useful for querying by chapter / status
ImportedQuestionSchema.index({ chapter_start: 1, status: 1 });
ImportedQuestionSchema.index({ source: 1 });

module.exports = mongoose.model('ImportedQuestion', ImportedQuestionSchema);
