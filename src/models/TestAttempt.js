const mongoose = require('mongoose');

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
    isCorrect: Boolean,
    marksAwarded: Number,
    timeSpent: Number, // seconds spent on this question
    isMarkedForReview: Boolean,
    attemptedAt: Date
  }],
  
  // Results
  results: {
    totalQuestions: Number,
    attempted: Number,
    correct: Number,
    incorrect: Number,
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
    attempted: 0,
    correct: 0,
    incorrect: 0,
    skipped: 0,
    markedForReview: 0,
    totalMarks: 0,
    marksObtained: 0,
    percentage: 0,
    subjectWise: [],
    chapterWise: [],
    difficultyWise: { easy: {}, medium: {}, hard: {} },
    timeAnalysis: {}
  };
  
  const subjectMap = {};
  const chapterMap = {};
  let totalTime = 0;
  
  this.answers.forEach(answer => {
    if (answer.selectedOption) {
      results.attempted++;
      if (answer.isCorrect) {
        results.correct++;
      } else {
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
    
    // Find question details
    const question = questions.find(q => q._id.toString() === answer.questionId.toString());
    if (question) {
      // Subject-wise
      if (!subjectMap[question.subject]) {
        subjectMap[question.subject] = { total: 0, attempted: 0, correct: 0, incorrect: 0, marks: 0 };
      }
      subjectMap[question.subject].total++;
      if (answer.selectedOption) subjectMap[question.subject].attempted++;
      if (answer.isCorrect) subjectMap[question.subject].correct++;
      else if (answer.selectedOption) subjectMap[question.subject].incorrect++;
      subjectMap[question.subject].marks += answer.marksAwarded || 0;
      
      // Chapter-wise
      const chapterKey = `${question.subject}-${question.chapter}`;
      if (!chapterMap[chapterKey]) {
        chapterMap[chapterKey] = { chapter: question.chapter, subject: question.subject, total: 0, correct: 0, incorrect: 0 };
      }
      chapterMap[chapterKey].total++;
      if (answer.isCorrect) chapterMap[chapterKey].correct++;
      else if (answer.selectedOption) chapterMap[chapterKey].incorrect++;
    }
  });
  
  // Calculate totals
  results.totalMarks = results.totalQuestions * 4; // Assuming 4 marks per question
  results.percentage = (results.marksObtained / results.totalMarks) * 100;
  
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
    avgTimePerQuestion: totalTime / results.totalQuestions,
    fastestQuestion: Math.min(...this.answers.map(a => a.timeSpent || 0)),
    slowestQuestion: Math.max(...this.answers.map(a => a.timeSpent || 0))
  };
  
  this.results = results;
  return results;
};

module.exports = mongoose.model('TestAttempt', testAttemptSchema);
