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

const moment = require('moment-timezone');

/**
 * Updates streak evaluating midnight boundary strictly in Asia/Kolkata.
 * @param {Object} user - User document or entry object
 * @param {Date} lastCompletedAt - Timestamp of prior completion
 */
const evaluateISTStreak = (user, lastCompletedAt) => {
  const nowIST = moment().tz('Asia/Kolkata');
  const todayStr = nowIST.format('YYYY-MM-DD');
  const yesterdayStr = nowIST.clone().subtract(1, 'day').format('YYYY-MM-DD');

  if (!lastCompletedAt) {
    return { streak: 1, streakMaintained: true };
  }

  const lastCompletedIST = moment(lastCompletedAt).tz('Asia/Kolkata').format('YYYY-MM-DD');

  if (lastCompletedIST === todayStr) {
    return { streak: user?.gamification?.dailyStreak || user?.streak || 1, streakMaintained: true };
  }

  if (lastCompletedIST === yesterdayStr) {
    return { streak: (user?.gamification?.dailyStreak || user?.streak || 0) + 1, streakMaintained: true };
  }

  const shieldsAvailable = user?.gamification?.streakShields || 0;
  if (shieldsAvailable > 0) {
    if (user?.gamification) user.gamification.streakShields -= 1;
    return {
      streak: user?.gamification?.dailyStreak || user?.streak || 1,
      shieldConsumed: true,
      streakMaintained: true
    };
  }

  return { streak: 1, streakMaintained: false };
};

// Static method to update user score
leaderboardSchema.statics.updateUserScore = async function(userId, username, score, xpReward) {
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
    const streakResult = evaluateISTStreak(entry, entry.lastCompletedDate);
    
    entry.totalXP += xpReward;
    entry.score = Math.max(entry.score || 0, score);
    entry.streak = streakResult.streak;
    entry.completedToday = true;
    entry.lastCompletedDate = new Date();
    entry.dailyChallengesCompleted = (entry.dailyChallengesCompleted || 0) + 1;
    entry.totalPoints = (entry.totalPoints || 0) + score;
  }
  
  await entry.save();
  return entry;
};

const Leaderboard = mongoose.model('Leaderboard', leaderboardSchema);
Leaderboard.evaluateISTStreak = evaluateISTStreak;

module.exports = Leaderboard;
module.exports.evaluateISTStreak = evaluateISTStreak;
