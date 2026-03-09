const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
    filterQuestions,
    getPYQs,
    generateCustomTest,
    getFilterMeta,
} = require('../controllers/questionFilterController');

router.use(protect);

// Paginated filter – subject, chapter, subtopic, difficulty, isPYQ, search
// GET /api/questions/filter?subject=biology&chapterId=...&difficulty=easy&page=1&limit=20
router.get('/filter', filterQuestions);

// PYQ shortcut – previous year questions
// GET /api/questions/pyq?subject=biology&pyqYear=2023&pyqExam=NEET
router.get('/pyq', getPYQs);

// Custom test generator – random N questions from filter criteria
// POST /api/questions/test  { subject, chapterId, subTopic, difficulty, count, mode }
router.post('/test', generateCustomTest);

// Aggregate counts for filter UI dropdowns
// GET /api/questions/meta?subject=biology
router.get('/meta', getFilterMeta);

module.exports = router;
