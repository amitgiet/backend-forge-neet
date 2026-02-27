const express = require('express');
const router = express.Router();
const { generateOrGetQuiz } = require('../controllers/quickQuizController');

router.get('/generate/:lineId', generateOrGetQuiz);

module.exports = router;
