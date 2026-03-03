const mongoose = require('mongoose');

const MockTestProgressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    testId: {
      type: String,
      required: true,
      index: true,
    },
    completed: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    collection: 'mocktestprogress',
  }
);

MockTestProgressSchema.index({ userId: 1, testId: 1 }, { unique: true });

module.exports = mongoose.model('MockTestProgress', MockTestProgressSchema);

