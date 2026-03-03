const express = require('express');
const {
  getMockTests,
  getMockProgress,
  markMockCompleted,
  proxyMockPdf,
  startTestAttempt,
  submitTestAttempt
} = require('../controllers/mockController');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.get('/pdf-proxy', proxyMockPdf);

router.use(protect);

router.get('/', getMockTests);
router.get('/progress', getMockProgress);
router.post('/:id/complete', markMockCompleted);
router.post('/:id/start', startTestAttempt);
router.post('/attempt/:attemptId/submit', submitTestAttempt);

module.exports = router;
