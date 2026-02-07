const express = require('express');
const { getChapters, getChapter } = require('../controllers/chapterController');
const router = express.Router();

router.get('/', getChapters);
router.get('/:chapterId', getChapter);

module.exports = router;
