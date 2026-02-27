const mongoose = require('mongoose');

/**
 * Central quiz metadata model.
 * Stores ONLY quiz configuration + references to canonical Question documents.
 */
const QuizMetaSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },

    title: { type: String },
    topic: { type: String, required: true },

    subject: {
      type: String,
      enum: ['physics', 'chemistry', 'biology', 'mathematics', 'general'],
      default: 'general',
      index: true
    },

    // Prefer Chapter.chapterId (string) instead of chapter number.
    chapterId: { type: String, index: true },
    topicId: { type: String, index: true },

    source: {
      type: String,
      enum: ['ai-chat', 'quiz-generator', 'daily-challenge', 'challenge', 'ncert-micro', 'manual'],
      default: 'quiz-generator',
      index: true
    },

    quizType: {
      type: String,
      enum: ['mcq', 'multiple_select', 'mixed'],
      default: 'mcq'
    },

    level: { type: Number, min: 1, max: 7, default: 1 },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard', 'mixed'], default: 'mixed' },

    // Ordered references to Question.questionId
    questionIds: [
      {
        questionId: { type: String, required: true },
        order: { type: Number, required: true }
      }
    ],

    totalQuestions: { type: Number, required: true },

    duration: {
      type: Number, // minutes
      default: function () {
        return (this.totalQuestions || 0) * 2;
      }
    },

    isPublished: { type: Boolean, default: true, index: true },
    tags: [String],

    // Lightweight stats (optional; attempts are not required for core functionality)
    attempts: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        attemptDate: { type: Date, default: Date.now },
        score: { type: Number, default: 0 },
        totalQuestions: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 },
        timeTaken: { type: Number, default: 0 },
        // Zero-based indexes of questions answered incorrectly in this attempt.
        wrongQuestionIndexes: [{ type: Number }]
      }
    ],
    totalAttempts: { type: Number, default: 0 },
    avgScore: { type: Number, default: 0 }
  },
  { timestamps: true }
);

QuizMetaSchema.index({ subject: 1, chapterId: 1, topicId: 1, createdAt: -1 });
QuizMetaSchema.index({ isPublished: 1, createdAt: -1 });

module.exports = mongoose.model('QuizMeta', QuizMetaSchema);

