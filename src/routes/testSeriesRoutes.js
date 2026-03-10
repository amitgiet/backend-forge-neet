const express = require('express');
const {
    getSeriesCatalog,
    getFilteredTests,
    getTestsBySeriesType,
    getTestsBySubject,
    getTestsByChapter,
    getTestsByTopic,
    getSubjects,
    getChapters,
    getTopics
} = require('../controllers/testSeriesController');

const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/series', getSeriesCatalog);
router.get('/tests', getFilteredTests);
router.get('/series/:seriesType/tests', getTestsBySeriesType);
router.get('/subject/:subjectId/tests', getTestsBySubject);
router.get('/chapter/:chapterId/tests', getTestsByChapter);
router.get('/topic/:topicId/tests', getTestsByTopic);

router.get('/hierarchy/subjects', getSubjects);
router.get('/hierarchy/subjects/:subjectId/chapters', getChapters);
router.get('/hierarchy/chapters/:chapterId/topics', getTopics);

module.exports = router;
