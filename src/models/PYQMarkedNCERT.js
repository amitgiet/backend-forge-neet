const mongoose = require('mongoose');

const PYQMarkedNCERTSchema = new mongoose.Schema({
  subject: {
    type: String,
    enum: ['physics', 'chemistry', 'biology'],
    required: true,
    lowercase: true
  },

  stream: {
    type: String,
    enum: ['botany', 'zoology'],
    default: null,
    lowercase: true
  },

  topicName: {
    type: String,
    required: true,
    trim: true
  },

  url: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Invalid URL'
    }
  },

  isAvailable: {
    type: Boolean,
    default: true
  },

  description: {
    type: String,
    default: ''
  },

  order: {
    type: Number,
    default: 0
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
PYQMarkedNCERTSchema.index({ subject: 1, stream: 1 });
PYQMarkedNCERTSchema.index({ topicName: 1 });

module.exports = mongoose.model('PYQMarkedNCERT', PYQMarkedNCERTSchema);
