const mongoose = require('mongoose');
const { isQuestionTypeGraded, normalizeQuestionType } = require('../utils/questionPayload');

const testAttemptSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  testId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Test',
    required: true,
    index: true
  },

  testType: {
    type: String,
    enum: ['FULL_MOCK', 'CHAPTER_QUIZ', 'CUSTOM_PRACTICE'],
    default: 'FULL_MOCK'
  },

  attemptNumber: {
    type: Number,
    default: 1
  },
  
  // Wall-Clock Anchoring & Timestamps
  startedAt: {
    type: Date,
    required: true,
    default: Date.now
  },

  expiresAt: {
    type: Date,
    index: true
  },
  
  submittedAt: {
    type: Date,
    default: null
  },

  durationMinutes: {
    type: Number,
    default: 200
  },
  
  status: {
    type: String,
    enum: ['in-progress', 'submitted', 'abandoned', 'IN_PROGRESS', 'SUBMITTED', 'EXPIRED'],
    default: 'IN_PROGRESS',
    index: true
  },

  serverTimestamps: {
    startedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      default: null
    },
    submittedAt: {
      type: Date,
      default: null
    }
  },

  wallClockRemainingSeconds: {
    type: Number,
    default: null
  },

  sectionBSelections: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({ PHY_B: [], CHEM_B: [], BOT_B: [], ZOO_B: [] })
  },

  scoringBreakdown: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  
  // Answers
  answers: [{
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true
    },
    sectionKey: {
      type: String,
      enum: ['PHY_A', 'PHY_B', 'CHEM_A', 'CHEM_B', 'BOT_A', 'BOT_B', 'ZOO_A', 'ZOO_B', null],
      default: null
    },
    selectedOption: {
      type: String,
      default: null
    },
    answerType: String,
    answerPayload: mongoose.Schema.Types.Mixed,
    isCorrect: {
      type: Boolean,
      default: false
    },
    marksAwarded: {
      type: Number,
      default: 0
    },
    isIgnoredExceedLimit: {
      type: Boolean,
      default: false
    },
    evaluationStatus: {
      type: String,
      enum: ['correct', 'incorrect', 'partial', 'ungraded', null],
      default: null
    },
    evaluationReason: {
      type: String,
      default: null
    },
    timeSpent: {
      type: Number,
      default: 0
    },
    timeSpentSeconds: {
      type: Number,
      default: 0
    },
    isMarkedForReview: {
      type: Boolean,
      default: false
    },
    attemptedAt: {
      type: Date,
      default: null
    }
  }],
  
  // Results
  results: {
    totalQuestions: Number,
    gradedQuestions: Number,
    ungradedQuestions: Number,
    attempted: Number,
    attemptedGraded: Number,
    attemptedUngraded: Number,
    correct: Number,
    incorrect: Number,
    partial: Number,
    skipped: Number,
    markedForReview: Number,
    
    totalMarks: Number,
    marksObtained: Number,
    maxMarks: { type: Number, default: 720 },
    percentage: Number,
    accuracy: Number,
    
    // Subject-wise breakdown
    subjectWise: [{
      subject: String,
      total: Number,
      attempted: Number,
      correct: Number,
      incorrect: Number,
      partial: Number,
      marks: Number,
      accuracy: Number
    }],

    subjectBreakdown: {
      physics: { marks: Number, correct: Number, incorrect: Number, unattempted: Number, accuracy: Number },
      chemistry: { marks: Number, correct: Number, incorrect: Number, unattempted: Number, accuracy: Number },
      botany: { marks: Number, correct: Number, incorrect: Number, unattempted: Number, accuracy: Number },
      zoology: { marks: Number, correct: Number, incorrect: Number, unattempted: Number, accuracy: Number }
    },
    
    // Chapter-wise breakdown
    chapterWise: [{
      chapter: String,
      subject: String,
      total: Number,
      correct: Number,
      incorrect: Number,
      partial: Number,
      accuracy: Number
    }],
    
    // Difficulty-wise
    difficultyWise: {
      easy: { correct: Number, total: Number },
      medium: { correct: Number, total: Number },
      hard: { correct: Number, total: Number }
    },
    
    // Time analysis
    timeAnalysis: {
      totalTime: Number,
      avgTimePerQuestion: Number,
      fastestQuestion: Number,
      slowestQuestion: Number
    },

    completionWise: {
      flashcardCompleted: Number,
      flashcardTotal: Number,
      videoCompleted: Number,
      videoTotal: Number
    },
    
    // Rank & Percentile
    rank: Number,
    predictedRank: Number,
    percentile: Number
  },

  score: {
    totalQuestions: Number,
    totalMarks: Number,
    attempted: Number,
    correct: Number,
    incorrect: Number,
    marksObtained: Number,
    percentage: Number
  },
  
  // Weak Areas Identified
  weakAreas: [{
    subject: String,
    chapter: String,
    topic: String,
    questionsWrong: Number,
    accuracy: Number
  }],

  responses: mongoose.Schema.Types.Mixed,
  timeSpent: Number
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
testAttemptSchema.index({ userId: 1, testId: 1 });
testAttemptSchema.index({ userId: 1, status: 1 });
testAttemptSchema.index({ status: 1, expiresAt: 1 });
testAttemptSchema.index({ userId: 1, testId: 1, status: 1 });
testAttemptSchema.index({ testId: 1, 'results.percentage': -1 });

// Pre-save hook to synchronize serverTimestamps & wallClockRemainingSeconds
testAttemptSchema.pre('save', function(next) {
  if (!this.serverTimestamps) {
    this.serverTimestamps = {};
  }
  if (this.startedAt && !this.serverTimestamps.startedAt) {
    this.serverTimestamps.startedAt = this.startedAt;
  }
  if (this.expiresAt && !this.serverTimestamps.expiresAt) {
    this.serverTimestamps.expiresAt = this.expiresAt;
  }
  if (this.submittedAt && !this.serverTimestamps.submittedAt) {
    this.serverTimestamps.submittedAt = this.submittedAt;
  }
  const expiry = this.serverTimestamps.expiresAt || this.expiresAt;
  if (expiry) {
    this.wallClockRemainingSeconds = Math.max(0, Math.floor((new Date(expiry).getTime() - Date.now()) / 1000));
  }
  next();
});

// Virtual for wallClockRemainingSeconds
testAttemptSchema.virtual('remainingSeconds').get(function() {
  const expiry = this.serverTimestamps?.expiresAt || this.expiresAt;
  if (!expiry) return null;
  return Math.max(0, Math.floor((new Date(expiry).getTime() - Date.now()) / 1000));
});

// Calculate results (legacy support)
testAttemptSchema.methods.calculateResults = function(questions) {
  const results = {
    totalQuestions: this.answers.length,
    gradedQuestions: 0,
    ungradedQuestions: 0,
    attempted: 0,
    attemptedGraded: 0,
    attemptedUngraded: 0,
    correct: 0,
    incorrect: 0,
    partial: 0,
    skipped: 0,
    markedForReview: 0,
    totalMarks: 0,
    marksObtained: 0,
    percentage: 0,
    subjectWise: [],
    chapterWise: [],
    difficultyWise: { easy: {}, medium: {}, hard: {} },
    timeAnalysis: {},
    completionWise: {
      flashcardCompleted: 0,
      flashcardTotal: 0,
      videoCompleted: 0,
      videoTotal: 0
    }
  };
  
  const subjectMap = {};
  const chapterMap = {};
  let totalTime = 0;
  
  this.answers.forEach(answer => {
    const hasStructuredAnswer =
      answer?.answerPayload &&
      ((typeof answer.answerPayload === 'object' && Object.keys(answer.answerPayload).length > 0) || typeof answer.answerPayload !== 'object');
    const attempted = Boolean(answer.selectedOption) || hasStructuredAnswer;

    const question = questions.find(q => q._id.toString() === answer.questionId.toString());
    const type = normalizeQuestionType(question?.questionType || question?.type);
    const isGraded = isQuestionTypeGraded(type);

    if (isGraded) results.gradedQuestions += 1;
    else results.ungradedQuestions += 1;

    if (attempted) {
      results.attempted++;
      if (isGraded) results.attemptedGraded++;
      else results.attemptedUngraded++;
      if (answer.isCorrect) {
        results.correct++;
      } else if (answer.evaluationStatus === 'partial') {
        results.partial++;
      } else if (answer.evaluationStatus !== 'ungraded') {
        results.incorrect++;
      }
    } else {
      results.skipped++;
    }
    
    if (answer.isMarkedForReview) {
      results.markedForReview++;
    }
    
    results.marksObtained += answer.marksAwarded || 0;
    totalTime += answer.timeSpent || answer.timeSpentSeconds || 0;
    
    if (question) {
      if (!isGraded) {
        if (type === 'flashcard') {
          results.completionWise.flashcardTotal += 1;
          if (attempted) results.completionWise.flashcardCompleted += 1;
        } else if (type === 'video') {
          results.completionWise.videoTotal += 1;
          if (attempted) results.completionWise.videoCompleted += 1;
        }
      }

      if (isGraded) {
        if (!subjectMap[question.subject]) {
          subjectMap[question.subject] = { total: 0, attempted: 0, correct: 0, incorrect: 0, partial: 0, marks: 0 };
        }
        subjectMap[question.subject].total++;
        if (attempted) subjectMap[question.subject].attempted++;
        if (answer.isCorrect) subjectMap[question.subject].correct++;
        else if (attempted && answer.evaluationStatus === 'partial') subjectMap[question.subject].partial++;
        else if (attempted && answer.evaluationStatus !== 'ungraded') subjectMap[question.subject].incorrect++;
        subjectMap[question.subject].marks += answer.marksAwarded || 0;

        const chapterKey = `${question.subject}-${question.chapter}`;
        if (!chapterMap[chapterKey]) {
          chapterMap[chapterKey] = { chapter: question.chapter, subject: question.subject, total: 0, correct: 0, incorrect: 0, partial: 0 };
        }
        chapterMap[chapterKey].total++;
        if (answer.isCorrect) chapterMap[chapterKey].correct++;
        else if (attempted && answer.evaluationStatus === 'partial') chapterMap[chapterKey].partial++;
        else if (attempted && answer.evaluationStatus !== 'ungraded') chapterMap[chapterKey].incorrect++;
      }
    }
  });
  
  results.totalMarks = results.gradedQuestions * 4;
  results.percentage = results.totalMarks > 0 ? (results.marksObtained / results.totalMarks) * 100 : 0;
  
  results.subjectWise = Object.keys(subjectMap).map(subject => ({
    subject,
    ...subjectMap[subject],
    accuracy: subjectMap[subject].attempted > 0 ? (subjectMap[subject].correct / subjectMap[subject].attempted) * 100 : 0
  }));
  
  results.chapterWise = Object.values(chapterMap).map(chapter => ({
    ...chapter,
    accuracy: chapter.total > 0 ? (chapter.correct / chapter.total) * 100 : 0
  }));
  
  results.timeAnalysis = {
    totalTime,
    avgTimePerQuestion: results.totalQuestions > 0 ? totalTime / results.totalQuestions : 0,
    fastestQuestion: this.answers.length > 0 ? Math.min(...this.answers.map(a => a.timeSpent || a.timeSpentSeconds || 0)) : 0,
    slowestQuestion: this.answers.length > 0 ? Math.max(...this.answers.map(a => a.timeSpent || a.timeSpentSeconds || 0)) : 0
  };
  
  this.results = results;
  return results;
};

module.exports = mongoose.model('TestAttempt', testAttemptSchema);
