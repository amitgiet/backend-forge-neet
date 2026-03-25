const mongoose = require('mongoose');
const { isQuestionTypeGraded, normalizeQuestionType } = require('../utils/questionPayload');

const testAttemptSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  testId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Test',
    required: true
  },
  
  // Attempt Details
  startedAt: {
    type: Date,
    required: true
  },
  
  submittedAt: Date,
  
  status: {
    type: String,
    enum: ['in-progress', 'submitted', 'abandoned'],
    default: 'in-progress'
  },
  
  // Answers
  answers: [{
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question'
    },
    selectedOption: String, // 'A', 'B', 'C', 'D' or answer text
    answerType: String,
    answerPayload: mongoose.Schema.Types.Mixed,
    isCorrect: Boolean,
    marksAwarded: Number,
    evaluationStatus: {
      type: String,
      enum: ['correct', 'incorrect', 'partial', 'ungraded', null],
      default: null,
    },
    evaluationReason: {
      type: String,
      default: null,
    },
    timeSpent: Number, // seconds spent on this question
    isMarkedForReview: Boolean,
    attemptedAt: Date
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
    percentage: Number,
    
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
      totalTime: Number, // seconds
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
    
    // Rank (calculated after submission)
    rank: Number,
    percentile: Number
  },
  
  // Weak Areas Identified
  weakAreas: [{
    subject: String,
    chapter: String,
    topic: String,
    questionsWrong: Number,
    accuracy: Number
  }]
}, {
  timestamps: true
});

// Indexes
testAttemptSchema.index({ userId: 1, testId: 1 });
testAttemptSchema.index({ userId: 1, status: 1 });
testAttemptSchema.index({ testId: 1, 'results.percentage': -1 }); // For ranking

// Calculate results
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
    totalTime += answer.timeSpent || 0;
    
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
        // Subject-wise score math should ignore ungraded learning items.
        if (!subjectMap[question.subject]) {
          subjectMap[question.subject] = { total: 0, attempted: 0, correct: 0, incorrect: 0, partial: 0, marks: 0 };
        }
        subjectMap[question.subject].total++;
        if (attempted) subjectMap[question.subject].attempted++;
        if (answer.isCorrect) subjectMap[question.subject].correct++;
        else if (attempted && answer.evaluationStatus === 'partial') subjectMap[question.subject].partial++;
        else if (attempted && answer.evaluationStatus !== 'ungraded') subjectMap[question.subject].incorrect++;
        subjectMap[question.subject].marks += answer.marksAwarded || 0;

        // Chapter-wise score math should also ignore ungraded learning items.
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
  
  // Calculate totals
  results.totalMarks = results.gradedQuestions * 4;
  results.percentage = results.totalMarks > 0 ? (results.marksObtained / results.totalMarks) * 100 : 0;
  
  // Subject-wise accuracy
  results.subjectWise = Object.keys(subjectMap).map(subject => ({
    subject,
    ...subjectMap[subject],
    accuracy: subjectMap[subject].attempted > 0 ? (subjectMap[subject].correct / subjectMap[subject].attempted) * 100 : 0
  }));
  
  // Chapter-wise accuracy
  results.chapterWise = Object.values(chapterMap).map(chapter => ({
    ...chapter,
    accuracy: chapter.total > 0 ? (chapter.correct / chapter.total) * 100 : 0
  }));
  
  // Time analysis
  results.timeAnalysis = {
    totalTime,
    avgTimePerQuestion: results.totalQuestions > 0 ? totalTime / results.totalQuestions : 0,
    fastestQuestion: this.answers.length > 0 ? Math.min(...this.answers.map(a => a.timeSpent || 0)) : 0,
    slowestQuestion: this.answers.length > 0 ? Math.max(...this.answers.map(a => a.timeSpent || 0)) : 0
  };
  
  this.results = results;
  return results;
};

module.exports = mongoose.model('TestAttempt', testAttemptSchema);
