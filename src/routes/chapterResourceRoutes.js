const express = require('express');
const { protect } = require('../middleware/auth');
const {
    getChapterResourceChapters,
    getChapterResourceDetail,
} = require('../controllers/chapterResourceController');

const router = express.Router();

router.use(protect);

router.get('/:subject/chapters', getChapterResourceChapters);
router.get('/:subject/chapters/:slug', getChapterResourceDetail);

module.exports = router;
