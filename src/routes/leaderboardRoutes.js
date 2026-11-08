const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const leaderboardService = require('../services/leaderboard.service');

router.use(protect);

router.get('/ranks', async (req, res, next) => {
  try {
    const { type = 'alltime', limit = 100 } = req.query;
    const userId = req.user._id || req.user.id;
    const result = await leaderboardService.getLeaderboard(userId, type, limit);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/my-rank', async (req, res, next) => {
  try {
    const { type = 'alltime' } = req.query;
    const userId = req.user._id || req.user.id;
    const result = await leaderboardService.getLeaderboard(userId, type, 1);
    res.status(200).json({
      success: true,
      data: {
        userRank: result.userRank,
        userXP: result.userXP
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { type = 'alltime', limit = 100 } = req.query;
    const userId = req.user._id || req.user.id;
    const result = await leaderboardService.getLeaderboard(userId, type, limit);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
