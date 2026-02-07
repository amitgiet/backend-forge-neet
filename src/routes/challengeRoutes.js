const express = require('express');
const router = express.Router();
const challengeController = require('../controllers/challengeController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.post('/', challengeController.createChallenge);
router.get('/', challengeController.getUserChallenges);
router.get('/:challengeId', challengeController.getChallengeById);
router.get('/:challengeId/today', challengeController.getTodaySchedule);
router.post('/:challengeId/complete/:dayNumber/:quizIndex', challengeController.completeQuiz);
router.delete('/:challengeId', challengeController.deleteChallenge);

module.exports = router;
