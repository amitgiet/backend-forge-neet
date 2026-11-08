const express = require('express');
const {
  uploadScorecard,
  getJobStatus,
  getScorecardHistory,
  generateRemediationQuiz
} = require('../controllers/mockAnalyzerController');
const { protect } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');

const router = express.Router();

router.use(protect);

router.post('/scorecard/upload', uploadSingle('scorecard'), uploadScorecard);
router.post('/upload', uploadSingle('scorecard'), uploadScorecard);
router.get('/jobs/:id', getJobStatus);
router.get('/history', getScorecardHistory);
router.post('/remediation-quiz', generateRemediationQuiz);

module.exports = router;
