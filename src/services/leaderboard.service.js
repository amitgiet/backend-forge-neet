const redisClient = require('../config/redis');
const User = require('../models/User');
const moment = require('moment-timezone');

class LeaderboardService {
  async recordXP(userId, xpGained) {
    const nowIST = moment().tz('Asia/Kolkata');
    const dailyKey = `leaderboard:daily:${nowIST.format('YYYY-MM-DD')}`;
    const weeklyKey = `leaderboard:weekly:${nowIST.format('YYYY-WW')}`;
    const allTimeKey = 'leaderboard:alltime';

    await Promise.all([
      redisClient.zincrby(allTimeKey, xpGained, userId.toString()),
      redisClient.zincrby(dailyKey, xpGained, userId.toString()),
      redisClient.zincrby(weeklyKey, xpGained, userId.toString())
    ]);

    await redisClient.expire(dailyKey, 172800);
    await redisClient.expire(weeklyKey, 1209600);

    await User.findByIdAndUpdate(userId, {
      $inc: { 'gamification.totalXP': xpGained }
    });
  }

  async getLeaderboard(userId, type = 'alltime', limit = 100) {
    const normalizedType = String(type || 'alltime').toLowerCase();
    const key = normalizedType === 'daily'
      ? `leaderboard:daily:${moment().tz('Asia/Kolkata').format('YYYY-MM-DD')}`
      : (normalizedType === 'weekly'
        ? `leaderboard:weekly:${moment().tz('Asia/Kolkata').format('YYYY-WW')}`
        : 'leaderboard:alltime');

    const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 100));

    const topMembers = await redisClient.zrevrange(key, 0, lim - 1, 'WITHSCORES');
    const userRank = await redisClient.zrevrank(key, userId.toString());
    const userScore = await redisClient.zscore(key, userId.toString());

    const userIds = [];
    for (let i = 0; i < topMembers.length; i += 2) {
      userIds.push(topMembers[i]);
    }

    const profiles = userIds.length > 0
      ? await User.find({ _id: { $in: userIds } }).select('name avatar').lean()
      : [];
    const profileMap = new Map(profiles.map(p => [p._id.toString(), p]));

    const ranks = [];
    for (let i = 0; i < topMembers.length; i += 2) {
      const uid = topMembers[i];
      const score = parseInt(topMembers[i + 1], 10);
      const prof = profileMap.get(uid);
      ranks.push({
        rank: i / 2 + 1,
        userId: uid,
        name: prof?.name || 'Aspirant',
        avatar: prof?.avatar,
        xp: score
      });
    }

    return {
      userRank: userRank !== null ? userRank + 1 : null,
      userXP: userScore ? parseInt(userScore, 10) : 0,
      leaderboard: ranks
    };
  }
}

module.exports = new LeaderboardService();
