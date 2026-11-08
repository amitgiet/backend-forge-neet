const mongoose = require('mongoose');

const chapterMasterySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  chapterName: {
    type: String,
    required: true,
    index: true
  },
  subject: {
    type: String,
    default: null
  },
  masteryScore: {
    type: Number,
    default: 0
  },
  lastTestedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

chapterMasterySchema.index({ userId: 1, chapterName: 1 }, { unique: true });

module.exports = mongoose.model('ChapterMastery', chapterMasterySchema);
