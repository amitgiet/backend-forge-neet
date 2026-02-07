const DailyChallengeService = require('../services/dailyChallengeService');
const Leaderboard = require('../models/Leaderboard');
const DailyChallenge = require('../models/DailyChallenge');

class DailyChallengeController {
  /**
   * Get today's daily challenge
   */
  static async getTodaysChallenge(req, res) {
    try {
      console.log('[DailyChallengeController] Getting today\'s challenge');
      const userId = req.user._id;

      const challenge = await DailyChallengeService.generateTodaysChallenge();
      
      // Populate the quiz
      const populatedChallenge = await DailyChallenge.findById(challenge._id).populate('quizId');

      // Check if user already completed this challenge
      const userCompletion = populatedChallenge.completedBy.find(
        c => c.userId.toString() === userId.toString()
      );

      res.status(200).json({
        success: true,
        message: 'Today\'s challenge retrieved',
        data: {
          id: populatedChallenge._id,
          topic: populatedChallenge.topic,
          subject: populatedChallenge.subject,
          difficulty: populatedChallenge.difficulty,
          icon: populatedChallenge.icon,
          xpReward: populatedChallenge.xpReward,
          timeLimit: populatedChallenge.timeLimit,
          content: populatedChallenge.content || '',
          questions: populatedChallenge.quizId?.questions || [],
          totalQuestions: populatedChallenge.quizId?.questions?.length || 0,
          // If user already completed, include their submission
          completed: !!userCompletion,
          userScore: userCompletion?.score || null,
          userXpEarned: userCompletion?.xpEarned || null,
          userAnswers: userCompletion?.answers || null,
          completedAt: userCompletion?.completedAt || null
        }
      });
    } catch (error) {
      console.error('[DailyChallengeController] Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Submit daily challenge answers
   */
  static async submitChallenge(req, res) {
    try {
      const { answers, challengeId } = req.body;
      const userId = req.user._id;
      const username = req.user.name || 'User';

      console.log(`[DailyChallengeController] Submitting challenge for user ${userId}`);

      if (!answers || !challengeId) {
        return res.status(400).json({
          success: false,
          error: 'Missing answers or challengeId'
        });
      }

      // Check if user already completed this challenge today
      const challenge = await DailyChallenge.findById(challengeId);
      if (!challenge) {
        return res.status(404).json({
          success: false,
          error: 'Challenge not found'
        });
      }

      const alreadyCompleted = challenge.completedBy.find(
        c => c.userId.toString() === userId.toString()
      );

      if (alreadyCompleted) {
        return res.status(400).json({
          success: false,
          error: 'You have already completed today\'s challenge',
          data: {
            completed: true,
            userScore: alreadyCompleted.score,
            userXpEarned: alreadyCompleted.xpEarned,
            completedAt: alreadyCompleted.completedAt
          }
        });
      }

      // Submit challenge and get score
      const result = await DailyChallengeService.submitChallenge(
        userId,
        username,
        answers,
        challengeId
      );

      // Update leaderboard
      const leaderboard = await Leaderboard.updateUserScore(
        userId,
        username,
        result.score,
        result.xpEarned
      );

      res.status(200).json({
        success: true,
        message: 'Challenge submitted successfully',
        data: {
          ...result,
          userRank: await Leaderboard.getUserRank(userId),
          leaderboard: leaderboard
        }
      });
    } catch (error) {
      console.error('[DailyChallengeController] Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Check if user completed today's challenge
   */
  static async hasCompletedToday(req, res) {
    try {
      const userId = req.user._id;

      const completed = await DailyChallenge.hasUserCompletedToday(userId);

      res.status(200).json({
        success: true,
        data: {
          completedToday: completed
        }
      });
    } catch (error) {
      console.error('[DailyChallengeController] Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = DailyChallengeController;
