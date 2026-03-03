const mongoose = require('mongoose');

const ImportedCurriculumQuizRunSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        subject: {
            type: String,
            required: true,
            enum: ['biology', 'chemistry', 'physics'],
            index: true,
        },
        chapterId: { type: String, required: true, index: true },
        topic: { type: String, required: true, index: true },
        subTopic: { type: String, required: true, index: true },
        mode: {
            type: String,
            enum: ['practice', 'test'],
            required: true,
            index: true,
        },
        uids: { type: [Number], default: [] },
        status: {
            type: String,
            enum: ['in_progress', 'submitted', 'abandoned', 'expired'],
            default: 'in_progress',
            index: true,
        },
        currentIndex: { type: Number, default: 0, min: 0 },
        answers: { type: [Number], default: [] },
        questionTimes: { type: [Number], default: [] },
        attemptedQuestions: { type: Number, default: 0, min: 0 },
        elapsedSeconds: { type: Number, default: 0, min: 0 },
        remainingSeconds: { type: Number, default: null, min: 0 },
        resumeCount: { type: Number, default: 0, min: 0 },
        maxResumes: { type: Number, default: 999 },
        correctAnswers: { type: Number, default: 0, min: 0 },
        totalQuestions: { type: Number, default: 0, min: 0 },
        percentage: { type: Number, default: 0, min: 0, max: 100 },
        startedAt: { type: Date, default: Date.now },
        lastActivityAt: { type: Date, default: Date.now, index: true },
        expiresAt: { type: Date, index: true },
        submittedAt: { type: Date, default: null },
        abandonedAt: { type: Date, default: null },
    },
    {
        timestamps: true,
        collection: 'importedcurriculumquizruns',
    }
);

ImportedCurriculumQuizRunSchema.index({ userId: 1, status: 1, lastActivityAt: -1 });
ImportedCurriculumQuizRunSchema.index({
    userId: 1,
    subject: 1,
    chapterId: 1,
    topic: 1,
    subTopic: 1,
    mode: 1,
    status: 1,
});
ImportedCurriculumQuizRunSchema.index({ expiresAt: 1, status: 1 });

module.exports = mongoose.model('ImportedCurriculumQuizRun', ImportedCurriculumQuizRunSchema);
