const mongoose = require('mongoose');

const ChapterSchema = new mongoose.Schema({
  // Unique identifier (e.g., "biology_photosynthesis", "physics_mechanics")
  chapterId: {
    type: String,
    required: [true, 'Chapter ID is required'],
    unique: true,
    trim: true,
    lowercase: true
  },

  // Chapter details
  name: {
    en: { type: String, required: true },
    hi: { type: String, required: true }
  },

  subject: {
    type: String,
    enum: ['physics', 'chemistry', 'biology', 'mathematics'],
    required: true
  },

  // Exam-specific weights (scalable for JEE, BITSAT, etc.)
  examWeights: {
    NEET_UG: {
      percentage: { type: Number, default: 0 }, // % of total exam
      questionsCount: { type: Number, default: 0 },
      marksPerQuestion: { type: Number, default: 4 },
      difficulty: {
        easy: { type: Number, default: 0 },
        medium: { type: Number, default: 0 },
        hard: { type: Number, default: 0 }
      }
    },
    JEE_MAIN: {
      percentage: { type: Number, default: 0 },
      questionsCount: { type: Number, default: 0 },
      marksPerQuestion: { type: Number, default: 4 },
      difficulty: {
        easy: { type: Number, default: 0 },
        medium: { type: Number, default: 0 },
        hard: { type: Number, default: 0 }
      }
    },
    JEE_ADVANCED: {
      percentage: { type: Number, default: 0 },
      questionsCount: { type: Number, default: 0 },
      marksPerQuestion: { type: Number, default: 4 },
      difficulty: {
        easy: { type: Number, default: 0 },
        medium: { type: Number, default: 0 },
        hard: { type: Number, default: 0 }
      }
    }
  },

  // NCERT mapping
  ncert: {
    class: { type: Number, enum: [11, 12], required: true },
    chapterNumber: { type: Number, required: true },
    totalPages: { type: Number, default: 0 },
    keyTopics: [String],
    pyqFrequency: { type: Number, default: 0 } // How often in past year questions
  },

  // Content metadata
  concepts: [{
    name: String,
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'] },
    isPYQHotspot: { type: Boolean, default: false }
  }],

  // Prerequisites (for learning path)
  prerequisites: [{ type: String }], // Array of chapterIds

  // Average time to master (in hours)
  estimatedStudyTime: {
    type: Number,
    default: 10
  },

  // Tags for search and filtering
  tags: [String],

  // Statistics
  stats: {
    totalQuestions: { type: Number, default: 0 },
    avgDifficulty: { type: Number, default: 5, min: 1, max: 10 },
    studentSuccessRate: { type: Number, default: 50 }
  },

  // Status
  isActive: {
    type: Boolean,
    default: true
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
ChapterSchema.index({ subject: 1, 'ncert.class': 1 });
ChapterSchema.index({ chapterId: 1 });
ChapterSchema.index({ tags: 1 });
ChapterSchema.index({ 'examWeights.NEET_UG.percentage': -1 });

// Virtual for questions
ChapterSchema.virtual('questions', {
  ref: 'Question',
  localField: 'chapterId',
  foreignField: 'chapterId',
  justOne: false
});

// Method to get exam-specific weight
ChapterSchema.methods.getExamWeight = function(examType) {
  return this.examWeights[examType] || { percentage: 0, questionsCount: 0 };
};

// Static method to get high-weight chapters for an exam
ChapterSchema.statics.getHighWeightChapters = async function(examType, subject, limit = 10) {
  const sortKey = `examWeights.${examType}.percentage`;
  return this.find({ subject, isActive: true })
    .sort({ [sortKey]: -1 })
    .limit(limit);
};

module.exports = mongoose.model('Chapter', ChapterSchema);
