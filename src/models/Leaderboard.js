const mongoose = require('mongoose');

const leaderboardSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  avatar: {
    type: String,
    default: 'A'
  },
  totalXP: {
    type: Number,
    default: 0,
    index: true
  },
  score: {
    type: Number,
    default: 0
  },
  streak: {
    type: Number,
    default: 0
  },
  completedToday: {
    type: Boolean,
    default: false
  },
  lastCompletedDate: Date,
  rank: {
    type: Number,
    computed: true // Will be calculated on retrieval
  },
  dailyChallengesCompleted: {
    type: Number,
    default: 0
  },
  totalPoints: {
    type: Number,
    default: 0
  },
  achievements: [{
    type: String,
    enum: ['first_challenge', 'perfect_score', 'week_streak', 'month_streak', 'top_10'],
    default: []
  }],
  updatedAt: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient leaderboard queries
leaderboardSchema.index({ totalXP: -1, createdAt: -1 });
leaderboardSchema.index({ userId: 1 }, { unique: true });
leaderboardSchema.index({ updatedAt: -1 });

// Update timestamp on save
leaderboardSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to get top leaderboard
leaderboardSchema.statics.getTopLeaderboard = async function(limit = 10, type = 'allTime') {
  const pipeline = [
    {
      $sort: { totalXP: -1 }
    },
    {
      $limit: limit
    },
    {
      $addFields: {
        rank: { $add: [{ $indexOfArray: [[], null] }, 1] }
      }
    }
  ];

  const result = await this.aggregate(pipeline);
  
  // Add rank manually
  return result.map((doc, index) => ({
    ...doc,
    rank: index + 1
  }));
};

// Static method to get user's rank
leaderboardSchema.statics.getUserRank = async function(userId) {
  const userEntry = await this.findOne({ userId });
  
  if (!userEntry) return null;
  
  const rank = await this.countDocuments({ totalXP: { $gt: userEntry.totalXP } });
  
  return {
    ...userEntry.toObject(),
    rank: rank + 1
  };
};

// Static method to update user score
leaderboardSchema.statics.updateUserScore = async function(userId, username, score, xpReward) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let entry = await this.findOne({ userId });
  
  if (!entry) {
    entry = new this({
      userId,
      name: username,
      avatar: username.charAt(0).toUpperCase(),
      totalXP: xpReward,
      score,
      streak: 1,
      completedToday: true,
      lastCompletedDate: new Date(),
      dailyChallengesCompleted: 1,
      totalPoints: score
    });
  } else {
    const lastCompleted = entry.lastCompletedDate ? new Date(entry.lastCompletedDate) : null;
    const isToday = lastCompleted && lastCompleted.toDateString() === new Date().toDateString();
    
    // Check if this is consecutive day
    let streak = entry.streak || 0;
    if (!isToday) {
      streak = 1;
    }
    
    entry.totalXP += xpReward;
    entry.score = Math.max(entry.score || 0, score);
    entry.streak = streak;
    entry.completedToday = true;
    entry.lastCompletedDate = new Date();
    entry.dailyChallengesCompleted = (entry.dailyChallengesCompleted || 0) + 1;
    entry.totalPoints = (entry.totalPoints || 0) + score;
  }
  
  await entry.save();
  return entry;
};

module.exports = mongoose.model('Leaderboard', leaderboardSchema);
