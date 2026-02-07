const mongoose = require('mongoose');

const revisionScheduleSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subject: {
    type: String,
    required: true,
    enum: ['Physics', 'Chemistry', 'Biology']
  },
  chapter: {
    type: String,
    required: true
  },
  topic: {
    type: String,
    required: true
  },
  
  // 7-Level Tracking
  currentLevel: {
    type: Number,
    default: 1,
    min: 1,
    max: 7
  },
  
  // Revision History
  revisions: [{
    level: {
      type: Number,
      required: true
    },
    completedAt: {
      type: Date,
      required: true
    },
    score: {
      type: Number,
      min: 0,
      max: 100
    },
    timeSpent: Number, // in minutes
    confidence: {
      type: String,
      enum: ['low', 'medium', 'high']
    }
  }],
  
  // Schedule Dates
  scheduledDates: {
    level1: Date, // Learn
    level2: Date, // Immediate Recall (same day)
    level3: Date, // Short-Term Review (1-2 days)
    level4: Date, // Weekly Reinforcement (7 days)
    level5: Date, // Monthly Check (30 days)
    level6: Date, // Pre-Exam Review
    level7: Date  // Final Boost
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'completed', 'skipped'],
    default: 'active'
  },
  
  // Retention Score (calculated)
  retentionScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  
  // Priority (calculated based on performance)
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  // Metadata
  lastRevisedAt: Date,
  nextRevisionDue: Date,
  isOverdue: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes
revisionScheduleSchema.index({ userId: 1, nextRevisionDue: 1 });
revisionScheduleSchema.index({ userId: 1, subject: 1, chapter: 1 });
revisionScheduleSchema.index({ userId: 1, isOverdue: 1 });

// Calculate next revision date based on level
revisionScheduleSchema.methods.calculateNextRevision = function() {
  const now = new Date();
  const lastRevision = this.lastRevisedAt || this.createdAt;
  
  const intervals = {
    1: 0,      // Same day
    2: 0,      // Same day (immediate recall)
    3: 1,      // 1-2 days
    4: 7,      // 7 days
    5: 30,     // 30 days
    6: null,   // Set manually before exam
    7: null    // Set manually before NEET
  };
  
  const daysToAdd = intervals[this.currentLevel];
  if (daysToAdd !== null) {
    const nextDate = new Date(lastRevision);
    nextDate.setDate(nextDate.getDate() + daysToAdd);
    this.nextRevisionDue = nextDate;
  }
  
  return this.nextRevisionDue;
};

// Calculate retention score
revisionScheduleSchema.methods.calculateRetention = function() {
  if (this.revisions.length === 0) return 0;
  
  const recentRevisions = this.revisions.slice(-3);
  const avgScore = recentRevisions.reduce((sum, r) => sum + (r.score || 0), 0) / recentRevisions.length;
  const completionRate = (this.currentLevel / 7) * 100;
  
  this.retentionScore = Math.round((avgScore * 0.7) + (completionRate * 0.3));
  return this.retentionScore;
};

// Update priority based on performance
revisionScheduleSchema.methods.updatePriority = function() {
  const now = new Date();
  const overdueDays = this.nextRevisionDue ? Math.floor((now - this.nextRevisionDue) / (1000 * 60 * 60 * 24)) : 0;
  
  if (overdueDays > 3 || this.retentionScore < 40) {
    this.priority = 'urgent';
  } else if (overdueDays > 1 || this.retentionScore < 60) {
    this.priority = 'high';
  } else if (this.retentionScore < 80) {
    this.priority = 'medium';
  } else {
    this.priority = 'low';
  }
  
  this.isOverdue = overdueDays > 0;
  return this.priority;
};

module.exports = mongoose.model('RevisionSchedule', revisionScheduleSchema);
