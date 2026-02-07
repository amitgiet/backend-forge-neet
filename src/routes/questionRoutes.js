const express = require('express');
const { getPracticeQuestions, getNeuronzRevision, submitQuestion } = require('../controllers/questionController');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.use(protect);

// Practice Mode
router.get('/practice', getPracticeQuestions);

// Neuronz Spaced Revision
router.get('/neuronz/due', getNeuronzRevision);

// Submit Answer
router.post('/submit', submitQuestion);

module.exports = router;
