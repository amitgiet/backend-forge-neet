const express = require('express');
const {
  getMockTests,
  getMockTestById,
  getMockProgress,
  markMockCompleted,
  proxyMockPdf,
  startTestAttempt,
  submitTestAttempt,
  submitMockTest
} = require('../controllers/mockController');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.get('/pdf-proxy', proxyMockPdf);

router.use(protect);

router.get('/', getMockTests);
router.get('/progress', getMockProgress);
router.get('/:id', getMockTestById);
router.post('/:id/complete', markMockCompleted);
router.post('/:id/start', startTestAttempt);
router.post('/attempt/:attemptId/submit', submitMockTest);
router.post('/:attemptId/submit', submitMockTest);
router.post('/submit/:attemptId', submitMockTest);

module.exports = router;
