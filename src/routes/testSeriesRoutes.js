const express = require('express');
const {
    getSubjects,
    getChapters,
    getTopics
} = require('../controllers/testSeriesController');

const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/hierarchy/subjects', getSubjects);
router.get('/hierarchy/subjects/:subjectId/chapters', getChapters);
router.get('/hierarchy/chapters/:chapterId/topics', getTopics);

module.exports = router;
