const mongoose = require('mongoose');

const GeneratedQuizSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Quiz metadata
  topic: {
    type: String,
    required: true
  },

  subject: {
    type: String,
    enum: ['physics', 'chemistry', 'biology', 'mathematics', 'general'],
    default: 'general'
  },

  level: {
    type: Number,
    min: 1,
    max: 7,
    required: true
  },

  quizType: {
    type: String,
    enum: ['mcq', 'multiple_select'],
    default: 'mcq'
  },

  // Questions array
  questions: [{
    questionNumber: Number,
    question: String,
    questionType: {
      type: String,
      enum: ['mcq', 'multiple_select'],
      default: 'mcq'
    },
    options: [String], // For MCQ/multiple select
    correctAnswer: Number, // Index of correct option
    correctAnswers: [Number], // For multiple select
    explanation: String,
    topic: String,
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium'
    },
    marks: {
      type: Number,
      default: 1
    }
  }],

  // Quiz statistics
  totalQuestions: {
    type: Number,
    required: true
  },

  totalMarks: {
    type: Number,
    default: function() {
      return this.questions.reduce((sum, q) => sum + (q.marks || 1), 0);
    }
  },

  duration: {
    type: Number, // in minutes
    default: function() {
      return this.totalQuestions * 2; // 2 minutes per question
    }
  },

  // AI Generation metadata
  generatedAt: {
    type: Date,
    default: Date.now
  },

  aiModel: {
    type: String,
    default: 'gemini-pro'
  },

  // Attempt tracking
  attempts: [{
    userId: mongoose.Schema.Types.ObjectId,
    attemptDate: Date,
    score: Number,
    percentage: Number,
    timeTaken: Number,
    answers: [Number]
  }],

  totalAttempts: {
    type: Number,
    default: 0
  },

  avgScore: {
    type: Number,
    default: 0
  },

  isPublished: {
    type: Boolean,
    default: true
  },

  tags: [String],

  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for quick queries
GeneratedQuizSchema.index({ userId: 1, createdAt: -1 });
GeneratedQuizSchema.index({ topic: 1, level: 1 });

module.exports = mongoose.model('GeneratedQuiz', GeneratedQuizSchema);
