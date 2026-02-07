const Leaderboard = require('../models/Leaderboard');

class LeaderboardController {
  /**
   * Get global leaderboard
   */
  static async getLeaderboard(req, res) {
    try {
      const { limit = 10, type = 'allTime' } = req.query;

      console.log('[LeaderboardController] Getting leaderboard');

      const leaderboard = await Leaderboard.aggregate([
        {
          $sort: { totalXP: -1 }
        },
        {
          $limit: parseInt(limit)
        }
      ]);

      // Add rank
      const withRank = leaderboard.map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));

      res.status(200).json({
        success: true,
        data: withRank
      });
    } catch (error) {
      console.error('[LeaderboardController] Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get user's rank and stats
   */
  static async getUserStats(req, res) {
    try {
      const userId = req.user._id;
      const username = req.user.name || 'User';

      console.log('[LeaderboardController] Getting user stats for', userId);

      let userEntry = await Leaderboard.findOne({ userId });

      // If user doesn't exist in leaderboard, create default entry
      if (!userEntry) {
        userEntry = await Leaderboard.create({
          userId,
          name: username,
          avatar: username.charAt(0).toUpperCase(),
          totalXP: 0,
          score: 0,
          streak: 0,
          completedToday: false,
          dailyChallengesCompleted: 0,
          totalPoints: 0,
          achievements: []
        });
      }

      // Get rank
      const rank = await Leaderboard.countDocuments({ totalXP: { $gt: userEntry.totalXP } });

      res.status(200).json({
        success: true,
        data: {
          ...userEntry.toObject(),
          rank: rank + 1
        }
      });
    } catch (error) {
      console.error('[LeaderboardController] Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get weekly leaderboard
   */
  static async getWeeklyLeaderboard(req, res) {
    try {
      const { limit = 10 } = req.query;

      console.log('[LeaderboardController] Getting weekly leaderboard');

      // Get last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const leaderboard = await Leaderboard.aggregate([
        {
          $match: {
            updatedAt: { $gte: sevenDaysAgo }
          }
        },
        {
          $sort: { totalXP: -1 }
        },
        {
          $limit: parseInt(limit)
        }
      ]);

      const withRank = leaderboard.map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));

      res.status(200).json({
        success: true,
        data: withRank
      });
    } catch (error) {
      console.error('[LeaderboardController] Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get daily leaderboard
   */
  static async getDailyLeaderboard(req, res) {
    try {
      const { limit = 10 } = req.query;

      console.log('[LeaderboardController] Getting daily leaderboard');

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const leaderboard = await Leaderboard.aggregate([
        {
          $match: {
            lastCompletedDate: {
              $gte: today
            }
          }
        },
        {
          $sort: { totalXP: -1 }
        },
        {
          $limit: parseInt(limit)
        }
      ]);

      const withRank = leaderboard.map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));

      res.status(200).json({
        success: true,
        data: withRank
      });
    } catch (error) {
      console.error('[LeaderboardController] Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get user's rank info
   */
  static async getUserRank(req, res) {
    try {
      const userId = req.user._id;
      const username = req.user.name || 'User';

      let userEntry = await Leaderboard.findOne({ userId });

      // If user doesn't exist in leaderboard, create default entry
      if (!userEntry) {
        userEntry = await Leaderboard.create({
          userId,
          name: username,
          avatar: username.charAt(0).toUpperCase(),
          totalXP: 0,
          score: 0,
          streak: 0,
          completedToday: false,
          dailyChallengesCompleted: 0,
          totalPoints: 0,
          achievements: []
        });
      }

      // Calculate rank
      const rank = await Leaderboard.countDocuments({ totalXP: { $gt: userEntry.totalXP } });

      // Get position in top 10
      const topTen = await Leaderboard.find()
        .sort({ totalXP: -1 })
        .limit(10)
        .select('userId name totalXP');

      const isTopTen = topTen.some(entry => entry.userId.toString() === userId.toString());

      res.status(200).json({
        success: true,
        data: {
          rank: rank + 1,
          totalXP: userEntry.totalXP,
          streak: userEntry.streak,
          isTopTen,
          challengesCompleted: userEntry.dailyChallengesCompleted
        }
      });
    } catch (error) {
      console.error('[LeaderboardController] Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = LeaderboardController;
