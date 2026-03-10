const express = require('express');
const {
    getFormulaSubjects,
    getFormulaTopics,
    getFormulaCards,
    updateCardProgress,
    getTopicProgress,
    getChapterProgressSummary,
    proxyFormulaImage
} = require('../controllers/formulaController');

const { protect } = require('../middleware/auth');

const router = express.Router();

// Public image proxy for <img src> loading without auth headers
router.route('/image-proxy').get(proxyFormulaImage);

// Protected formula APIs
router.use(protect);

router.route('/subjects').get(getFormulaSubjects);
router.route('/topics').get(getFormulaTopics); // Can use ?chapterTitle=...
router.route('/topics/:topicTitle/cards').get(getFormulaCards);

// User progress routes
router.route('/progress/chapter/:chapterTitle').get(getChapterProgressSummary);
router.route('/progress/topic/:topicTitle').get(getTopicProgress);
router.route('/progress/:cardId').post(updateCardProgress);

module.exports = router;
