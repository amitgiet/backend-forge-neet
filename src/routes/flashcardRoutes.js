'use strict';

const express = require('express');
const {
    getFlashcardSubjects,
    getChapterDeck,
    getDueDeck,
    syncBatchProgress,
    updateCardProgress,
    getHubSummary,
} = require('../controllers/flashcardController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/subjects').get(getFlashcardSubjects);
router.route('/summary').get(getHubSummary);
router.route('/hub/summary').get(getHubSummary);
router.route('/chapters/:chapterTitle/deck').get(getChapterDeck);
router.route('/deck/due').get(getDueDeck);
router.route('/progress/batch').post(syncBatchProgress);
router.route('/progress/:cardId').post(updateCardProgress);

module.exports = router;
