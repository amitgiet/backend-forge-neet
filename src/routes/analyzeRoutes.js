const express = require('express');
const {
  uploadAndAnalyze,
  getJobStatus,
  getScorecardHistory,
  generateRemediationQuiz,
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

// Upload and analyze scorecard (PDF or Image)
router.post('/upload',
  uploadSingle('scorecard'),
  uploadAndAnalyze
);

// Alternative upload path for scorecard
router.post('/scorecard/upload',
  uploadSingle('scorecard'),
  uploadAndAnalyze
);

// Job status polling
router.get('/jobs/:jobId', getJobStatus);

// Scorecard upload history
router.get('/history', getScorecardHistory);

// Remediation quiz generation
router.post('/remediation-quiz', generateRemediationQuiz);

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
