const express = require('express');
const {
    getFormulaSubjects,
    getFormulaTopics,
    getFormulaCards,
    getDueDeck,
    syncFormulaBatch,
    getChapterSummary,
    updateCardProgress,
    getTopicProgress,
    getChapterProgressSummary,
    proxyFormulaImage,
    proxyDiagramImage
} = require('../controllers/formulaController');

const { protect } = require('../middleware/auth');

const router = express.Router();

// Public image proxy for streaming images without auth headers
router.route('/image-proxy').get(proxyFormulaImage);
router.route('/diagram/proxy').get(proxyDiagramImage);

// Protected formula APIs
router.use(protect);

router.route('/subjects').get(getFormulaSubjects);
router.route('/topics').get(getFormulaTopics);
router.route('/topics/:topicTitle/cards').get(getFormulaCards);

// SM-2 Deck & Progress
router.route('/deck/due').get(getDueDeck);
router.route('/chapters/:chapter/summary').get(getChapterSummary);
router.route('/progress/batch').post(syncFormulaBatch);

// User progress routes
router.route('/progress/chapter/:chapterTitle').get(getChapterProgressSummary);
router.route('/progress/topic/:topicTitle').get(getTopicProgress);
router.route('/progress/:cardId').post(updateCardProgress);

module.exports = router;
