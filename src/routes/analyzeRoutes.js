const express = require('express');
const {
    uploadAndAnalyze,
    getWeaknesses,
    getTargetedQuestions,
    analyzeTestAttempt,
    getWeaknessTrends
} = require('../controllers/weaknessController');

const { protect, authorize } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Upload and analyze scorecard (PDF)
router.post('/upload',
    uploadSingle('scorecard'),
    uploadAndAnalyze
);

// Get user's weaknesses
router.get('/weaknesses', getWeaknesses);

// Get targeted questions for a weak chapter
router.get('/fix/:chapterId', getTargetedQuestions);

// Analyze specific test attempt
router.get('/test/:attemptId', analyzeTestAttempt);

// Get weakness trends over time (Pro feature)
router.get('/trends',
    authorize('pro', 'ultimate'),
    getWeaknessTrends
);

module.exports = router;
