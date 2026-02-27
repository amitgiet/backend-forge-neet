const express = require('express');
const {
    getDueLines,
    processLineSession,
    generateMicroQuizzes,
    getUserStats,
    getLinesByLevel,
    resetLineLevel,
    getMasteryProgress,
    checkDailyLimit,
    trackChapter,
    trackBySubjectAndTopic,
    adjustLineLevel,
    customizeSchedule,
    getLineAnalytics,
    cleanupUserLines,
    getTopicSummary,
    getTopicDueLines,
    startTopicBaseline,
    getTopicAvailability
    , getTopicSubmissionHistory
} = require('../controllers/neuronzController');

const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes are protected
router.use(protect);

// @route   DELETE /api/neuronz/cleanup
// @desc    Clean up invalid UserLines (for development)
router.delete('/cleanup', cleanupUserLines);

// @route   GET /api/neuronz/due
// @desc    Get due NCERT lines for today
router.get('/due', getDueLines);

// @route   POST /api/neuronz/session
// @desc    Process quiz session for a line
router.post('/session', processLineSession);

// @route   GET /api/neuronz/quizzes/:lineId
// @desc    Generate micro-quizzes for an NCERT line
router.get('/quizzes/:lineId', generateMicroQuizzes);

// @route   GET /api/neuronz/stats
// @desc    Get user's NeuronZ statistics
router.get('/stats', getUserStats);

// @route   GET /api/neuronz/mastery
// @desc    Get mastery progress
router.get('/mastery', getMasteryProgress);

// @route   GET /api/neuronz/limit
// @desc    Check daily limit status
router.get('/limit', checkDailyLimit);

// @route   POST /api/neuronz/track-chapter
// @desc    Add all lines from a chapter to user's tracking
router.post('/track-chapter', trackChapter);

// @route   POST /api/neuronz/track-topic
// @desc    Track by subject and topic for NeuronZ practice
router.post('/track-topic', trackBySubjectAndTopic);

// @route   GET /api/neuronz/topics/summary
// @desc    Topic-level summary for revision/dashboard cards
router.get('/topics/summary', getTopicSummary);

// @route   GET /api/neuronz/topics/availability
// @desc    Check if topic has mapped NCERT lines
router.get('/topics/availability', getTopicAvailability);

// @route   GET /api/neuronz/topics/:topicId/due
// @desc    Due lines for a single topic
router.get('/topics/:topicId/due', getTopicDueLines);

// @route   GET /api/neuronz/topics/:topicId/history
// @desc    Past submissions for a topic
router.get('/topics/:topicId/history', getTopicSubmissionHistory);

// @route   POST /api/neuronz/topics/:topicId/baseline
// @desc    Build baseline line set for selected topic
router.post('/topics/:topicId/baseline', startTopicBaseline);

// @route   GET /api/neuronz/level/:level
// @desc    Get lines by specific level
router.get('/level/:level', getLinesByLevel);

// @route   PUT /api/neuronz/reset/:lineId
// @desc    Reset line to Level 1
router.put('/reset/:lineId', resetLineLevel);

// @route   PUT /api/neuronz/:lineId/level
// @desc    Adjust line level manually
router.put('/:lineId/level', adjustLineLevel);

// @route   PUT /api/neuronz/:lineId/customize
// @desc    Customize line schedule and priority
router.put('/:lineId/customize', customizeSchedule);

// @route   GET /api/neuronz/:lineId/analytics
// @desc    Get line analytics and performance
router.get('/:lineId/analytics', getLineAnalytics);

module.exports = router;
