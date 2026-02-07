const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getTests,
  getTestById,
  startTest,
  saveAnswer,
  submitTest,
  getAttempt,
  getUserAttempts,
  createCustomTest
} = require('../controllers/testController');

router.use(protect);

router.get('/', getTests);
router.get('/my-attempts', getUserAttempts);
router.get('/:testId', getTestById);
router.post('/:testId/start', startTest);
router.post('/attempts/:attemptId/answer', saveAnswer);
router.post('/attempts/:attemptId/submit', submitTest);
router.get('/attempts/:attemptId', getAttempt);
router.post('/custom', createCustomTest);

module.exports = router;
