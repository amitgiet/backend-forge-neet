const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  generateQuiz,
  getQuiz,
  getUserQuizzes,
  submitQuizAttempt,
  deleteQuiz,
  getQuizStats
} = require('../controllers/quizGeneratorController');

// All routes require authentication
router.use(protect);

// @route   POST /api/quiz-generator/generate
// @desc    Generate AI quiz for a topic
router.post('/generate', generateQuiz);

// @route   GET /api/quiz-generator/quizzes/list
// @desc    Get all user quizzes (MUST come before /:quizId route)
router.get('/quizzes/list', getUserQuizzes);

// @route   GET /api/quiz-generator/:quizId/stats
// @desc    Get quiz statistics
router.get('/:quizId/stats', getQuizStats);

// @route   POST /api/quiz-generator/:quizId/submit
// @desc    Submit quiz attempt
router.post('/:quizId/submit', submitQuizAttempt);

// @route   GET /api/quiz-generator/:quizId
// @desc    Get single quiz (MUST come after specific routes like /stats)
router.get('/:quizId', getQuiz);

// @route   DELETE /api/quiz-generator/:quizId
// @desc    Delete quiz
router.delete('/:quizId', deleteQuiz);

module.exports = router;
