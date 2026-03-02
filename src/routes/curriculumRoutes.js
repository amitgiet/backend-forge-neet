const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
    getSubjectList,
    getAllChapters,
    getTopicsByChapter,
    getSubTopics,
    getQuestionsByUIDs,
} = require('../controllers/curriculumController');

// All curriculum routes require authentication
router.use(protect);

// List available subjects
router.get('/subjects', getSubjectList);

// List all chapters for a subject
router.get('/:subject/chapters', getAllChapters);

// Get topics (without UIDs) for a specific chapter
router.get('/:subject/chapters/:chapterId/topics', getTopicsByChapter);

// Get sub-topics (with UIDs) for a specific chapter; optional ?topic= filter
router.get('/:subject/chapters/:chapterId/subtopics', getSubTopics);

// Fetch actual questions by UID list: ?uids=10101,10102&page=1&limit=20
router.get('/questions', getQuestionsByUIDs);

module.exports = router;
