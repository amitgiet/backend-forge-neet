const mongoose = require('mongoose');

const dailyChallengeSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true,
    default: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today;
    }
  },
  topic: {
    type: String,
    required: true
  },
  subject: {
    type: String,
    enum: ['Physics', 'Chemistry', 'Biology', 'Mathematics', 'physics', 'chemistry', 'biology', 'mathematics'],
    required: true
  },
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard', 'easy', 'medium', 'hard'],
    default: 'Medium'
  },
  icon: {
    type: String,
    default: '📚'
  },
  xpReward: {
    type: Number,
    default: 150
  },
  timeLimit: {
    type: Number,
    default: 10 // in minutes
  },
  // Reading material content for the topic
  content: {
    type: String,
    default: ''
  },
  // Reference to GeneratedQuiz that contains the actual questions
  quizId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuizMeta',
    required: false
  },
  description: String,
  isActive: {
    type: Boolean,
    default: true
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

// Index for efficient date lookup
dailyChallengeSchema.index({ date: -1 });

// Static method to get today's challenge
dailyChallengeSchema.statics.getTodaysChallenge = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let challenge = await this.findOne({ date: today, isActive: true });
  
  // If no challenge for today, create one
  if (!challenge) {
    challenge = await this.create({
      date: today,
      topic: 'Molecular Structure and Bonding',
      subject: 'Chemistry',
      difficulty: 'Medium',
      xpReward: 150,
      timeLimit: 10,
      icon: '🔬'
    });
  }
  
  return challenge;
};

// Static method to check if user completed today's challenge
dailyChallengeSchema.statics.hasUserCompletedToday = async function(userId) {
  const DailyChallengeAttempt = require('./DailyChallengeAttempt');
  const moment = require('moment-timezone');
  const todayIST = moment().tz('Asia/Kolkata').format('YYYY-MM-DD');
  
  const attempt = await DailyChallengeAttempt.findOne({
    userId,
    dateIST: todayIST
  });
  
  return !!attempt;
};

module.exports = mongoose.model('DailyChallenge', dailyChallengeSchema);
