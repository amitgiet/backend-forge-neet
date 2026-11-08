const express = require('express');
const {
    getDueQuestions,
    getLevelQuestions,
    reviewQuestion,
    reviewBatch,
    getUserStats,
    getMasteryProgress,
    getTopicSummary,
    getDashboard,
    getDailyBlitz,
} = require('../controllers/neuronzController');

const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

// @route   GET /api/neuronz/dashboard
// @desc    Get structured stats for 7-level pyramid dashboard
router.get('/dashboard', getDashboard);

// @route   GET /api/neuronz/blitz
// @desc    Assemble Daily 20 Blitz session
router.get('/blitz', getDailyBlitz);

// @route   GET /api/neuronz/due
// @desc    Get due questions grouped by level L1–L7
router.get('/due', getDueQuestions);

// @route   GET /api/neuronz/stats
// @desc    User NeuronZ statistics
router.get('/stats', getUserStats);

// @route   GET /api/neuronz/mastery
// @desc    Mastery progress for dashboard
router.get('/mastery', getMasteryProgress);

// @route   GET /api/neuronz/topics/summary
// @desc    Get tracked topics summary
router.get('/topics/summary', getTopicSummary);

// @route   POST /api/neuronz/review
// @desc    Submit single question answer in NeuronZ review session
router.post('/review', reviewQuestion);

// @route   POST /api/neuronz/review/batch
// @desc    Submit all answers after completing a level quiz
router.post('/review/batch', reviewBatch);
router.post('/review-batch', reviewBatch);

// @route   GET /api/neuronz/level/:level/questions
// @desc    Get question docs for a specific level (for quiz player)
router.get('/level/:level/questions', getLevelQuestions);

module.exports = router;
