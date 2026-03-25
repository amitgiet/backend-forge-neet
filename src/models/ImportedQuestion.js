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

        questionHi: {
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

        optionsHi: {
            A: { type: String, default: null },
            B: { type: String, default: null },
            C: { type: String, default: null },
            D: { type: String, default: null },
        },

        explanation: {
            type: String,
            default: null,
        },

        explanationHi: {
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

        // Subject this question belongs to – backfilled from importedcurriculum
        subject: {
            type: String,
            enum: ['biology', 'chemistry', 'physics', null],
            default: null,
            index: true,
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



        // ─── Bridge Fields ────────────────────────────────────────────────────

        // Chapter ID mapped from ImportedCurriculum._id
        // Backfilled by scripts/backfillChapterId.js
        chapterId: {
            type: String,
            default: null,
            index: true,
        },

        // Topic and sub-topic from ImportedCurriculum (backfilled)
        topic: {
            type: String,
            default: null,
        },

        subTopic: {
            type: String,
            default: null,
        },

        // Difficulty level for filtering and test generation
        difficulty: {
            type: String,
            enum: ['easy', 'medium', 'hard', null],
            default: null,
            index: true,
        },

        // PYQ (Previous Year Question) fields
        isPYQ: {
            type: Boolean,
            default: false,
            index: true,
        },

        pyqYear: {
            type: Number,
            default: null,
            index: true,
        },

        pyqExam: {
            // e.g. "NEET", "AIPMT", "AIIMS", "JIPMER"
            type: String,
            enum: ['NEET', 'AIPMT', 'AIIMS', 'JIPMER', 'NEET_UG', null],
            default: null,
        },

        pyqShift: {
            // e.g. "S1", "S2"
            type: String,
            default: null,
        },

        // Free-form tags for searching / grouping
        tags: {
            type: [String],
            default: [],
        },

        // Optional image URL for diagram-based questions
        imageUrl: {
            type: String,
            default: null,
        },

        // Source image identifier from the imported question dataset
        imageId: {
            type: String,
            default: null,
        },

        // Admin / content QA flags
        isVerified: {
            type: Boolean,
            default: false,
        },

        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
    },
    {
        timestamps: true,
        collection: 'importedquestions',
    }
);

// ─── Indexes ────────────────────────────────────────────────────

// Legacy indexes
ImportedQuestionSchema.index({ chapter_start: 1, status: 1 });
ImportedQuestionSchema.index({ source: 1 });
ImportedQuestionSchema.index({ subject: 1, status: 1 });

// Bridge field indexes — power the test generator, PYQ filters, analytics
ImportedQuestionSchema.index({ subject: 1, chapterId: 1 });
ImportedQuestionSchema.index({ subject: 1, chapterId: 1, difficulty: 1 });
ImportedQuestionSchema.index({ chapterId: 1, subTopic: 1 });
ImportedQuestionSchema.index({ isPYQ: 1, pyqYear: -1 });
ImportedQuestionSchema.index({ isPYQ: 1, subject: 1, pyqYear: -1 });
ImportedQuestionSchema.index({ isActive: 1, subject: 1 });
ImportedQuestionSchema.index({ tags: 1 });

// ─── Static Helpers ───────────────────────────────────────────────────

/**
 * Fetch questions by an array of numeric UIDs (preserves order).
 * Used by curriculumController and custom test generator.
 */
ImportedQuestionSchema.statics.getByUIDs = async function (uids = []) {
    const uidList = uids.map((u) => String(u)).filter(Boolean);
    if (uidList.length === 0) return [];
    const docs = await this.find({ questionId: { $in: uidList }, isActive: true }).lean();
    const map = {};
    docs.forEach((d) => { map[d.questionId] = d; });
    // Return in the same order as input uids
    return uidList.map((uid) => map[uid]).filter(Boolean);
};

/**
 * Get PYQs with optional filters.
 * Used by PYQ filter screen and PYQ test generator.
 */
ImportedQuestionSchema.statics.getPYQs = async function ({
    subject,
    chapterId,
    pyqYear,
    pyqExam,
    limit = 50,
} = {}) {
    const query = { isPYQ: true, isActive: true };
    if (subject) query.subject = subject;
    if (chapterId) query.chapterId = chapterId;
    if (pyqYear) query.pyqYear = Number(pyqYear);
    if (pyqExam) query.pyqExam = pyqExam;
    return this.find(query).sort({ pyqYear: -1 }).limit(limit).lean();
};

/**
 * Get a random set of questions for custom test generation.
 * Filters: subject, chapterId, subTopic, difficulty, isPYQ
 */
ImportedQuestionSchema.statics.getForTest = async function ({
    subject,
    chapterId,
    subTopic,
    difficulty,
    isPYQ,
    count = 20,
} = {}) {
    const query = { isActive: true };
    if (subject) query.subject = subject;
    if (chapterId) query.chapterId = chapterId;
    if (subTopic) query.subTopic = subTopic;
    if (difficulty) query.difficulty = difficulty;
    if (typeof isPYQ === 'boolean') query.isPYQ = isPYQ;

    return this.aggregate([
        { $match: query },
        { $sample: { size: Math.min(200, Number(count) || 20) } },
    ]);
};

module.exports = mongoose.model('ImportedQuestion', ImportedQuestionSchema);
