const DailyChallengeService = require('../services/dailyChallengeService');
const Leaderboard = require('../models/Leaderboard');
const DailyChallenge = require('../models/DailyChallenge');
const QuizFactoryService = require('../services/quizFactoryService');

class DailyChallengeController {
  /**
   * Get today's daily challenge
   */
  static async getTodaysChallenge(req, res) {
    try {
      console.log('[DailyChallengeController] Getting today\'s challenge');
      const userId = req.user._id;

      const challenge = await DailyChallengeService.generateTodaysChallenge();

      let populatedChallenge;
      let questions = [];

      if (challenge._id === 'emergency') {
        populatedChallenge = challenge;
        // Fallback questions are already simple objects
        questions = (challenge.quizId?.questions || []).map(q => ({
          question: q.question || '',
          options: Array.isArray(q.options) ? q.options : [],
          correctAnswer: q.correct || 0,
          explanation: q.explanation || ''
        }));
      } else {
        populatedChallenge = await DailyChallenge.findById(challenge._id).lean();
        const quizResult = populatedChallenge?.quizId
          ? await QuizFactoryService.getQuizWithQuestions(String(populatedChallenge.quizId))
          : null;

        questions = (quizResult?.questions || []).map((q) => {
          const opts = Array.isArray(q.options) ? q.options : [];
          const optionTexts = opts.map((o) => o?.text?.en || '');
          const correctKey = q.correctAnswer;
          const correctAnswer = opts.findIndex((o) => o?.key === correctKey);
          return {
            question: q.question?.en || '',
            options: optionTexts,
            correctAnswer: correctAnswer >= 0 ? correctAnswer : 0,
            explanation: q.explanation?.en || ''
          };
        });
      }

      // Check if user already completed this challenge
      const userCompletion = (populatedChallenge.completedBy || []).find(
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
          questions,
          totalQuestions: questions.length,
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
      let challenge;
      let alreadyCompleted = null;

      if (challengeId === 'emergency') {
        challenge = await DailyChallengeService.getEmergencyChallenge();
        // Since database is completely unavailable for emergency fallback,
        // we can't reliably track 'already completed'. We just bypass the check.
        alreadyCompleted = null;
      } else {
        challenge = await DailyChallenge.findById(challengeId);
        if (challenge && challenge.completedBy) {
          alreadyCompleted = challenge.completedBy.find(
            c => c.userId.toString() === userId.toString()
          );
        }
      }

      if (!challenge) {
        return res.status(404).json({
          success: false,
          error: 'Challenge not found'
        });
      }

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
