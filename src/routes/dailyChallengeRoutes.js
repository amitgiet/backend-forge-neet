const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const DailyChallengeController = require('../controllers/dailyChallengeController');
const LeaderboardController = require('../controllers/leaderboardController');

// Daily Challenge Routes
router.get('/', protect, DailyChallengeController.getTodaysChallenge);
router.post('/submit', protect, DailyChallengeController.submitChallenge);
router.get('/completed', protect, DailyChallengeController.hasCompletedToday);

// Leaderboard Routes
router.get('/leaderboard', protect, LeaderboardController.getLeaderboard);
router.get('/leaderboard/user-stats', protect, LeaderboardController.getUserStats);
router.get('/leaderboard/daily', protect, LeaderboardController.getDailyLeaderboard);
router.get('/leaderboard/weekly', protect, LeaderboardController.getWeeklyLeaderboard);
router.get('/leaderboard/user-rank', protect, LeaderboardController.getUserRank);

module.exports = router;
