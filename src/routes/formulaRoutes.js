const express = require('express');
const {
    getFormulaSubjects,
    getFormulaTopics,
    getFormulaCards,
    updateCardProgress,
    getTopicProgress,
    getChapterProgressSummary
} = require('../controllers/formulaController');

const { protect } = require('../middleware/auth');

const router = express.Router();

// Public or Protected depending on requirements. Let's make them protected so only logged-in users access them.
router.use(protect);

router.route('/subjects').get(getFormulaSubjects);
router.route('/topics').get(getFormulaTopics); // Can use ?chapterTitle=...
router.route('/topics/:topicTitle/cards').get(getFormulaCards);

// User progress routes
router.route('/progress/chapter/:chapterTitle').get(getChapterProgressSummary);
router.route('/progress/topic/:topicTitle').get(getTopicProgress);
router.route('/progress/:cardId').post(updateCardProgress);

module.exports = router;
