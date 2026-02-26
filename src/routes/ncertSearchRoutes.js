const express = require('express');
const { protect } = require('../middleware/auth');
const {
    proxyNcertPdf,
    getSubjects,
    getChapters,
    getTopics,
    getTopicQuiz,
    submitTopicQuiz
} = require('../controllers/ncertSearchController');

const router = express.Router();

// Public PDF proxy for iframe-safe rendering
router.get('/pdf-proxy', proxyNcertPdf);

router.use(protect);

router.get('/subjects', getSubjects);
router.get('/chapters', getChapters);
router.get('/topics', getTopics);
router.get('/topics/:topicObjectId/quiz', getTopicQuiz);
router.post('/topics/:topicObjectId/quiz/submit', submitTopicQuiz);

module.exports = router;
