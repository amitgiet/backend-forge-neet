const mongoose = require('mongoose');

const scorecardAttemptSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fileHash: {
    type: String,
    default: null
  },
  source: {
    type: String,
    enum: ['upload', 'manual', 'camera', 'pdf', 'image'],
    default: 'upload'
  },
  testTitle: {
    type: String,
    default: 'NEET Mock Test'
  },
  scoring: {
    marksObtained: { type: Number, default: 0 },
    maxMarks: { type: Number, default: 720 },
    percentage: { type: Number, default: 0 },
    totalAttempted: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    incorrectCount: { type: Number, default: 0 },
    unattemptedCount: { type: Number, default: 0 },
    negativeMarksLost: { type: Number, default: 0 }
  },
  subjectBreakdown: {
    type: mongoose.Schema.Types.Mixed,
    default: []
  },
  chapterAnalysis: {
    type: mongoose.Schema.Types.Mixed,
    default: []
  },
  aiDiagnostic: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  processingStatus: {
    type: String,
    enum: ['queued', 'processing', 'completed', 'failed'],
    default: 'queued'
  },
  errorMessage: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

scorecardAttemptSchema.index({ userId: 1, createdAt: -1 });
scorecardAttemptSchema.index({ fileHash: 1 });

module.exports = mongoose.model('ScorecardAttempt', scorecardAttemptSchema);
