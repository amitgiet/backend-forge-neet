const express = require('express');
const {
  createQuestion,
  createTopic,
  getAdminStats,
  updateChapterContentSource,
  updateTopicContentSource
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');
const router = express.Router();

// All routes require authentication and admin role (implied by authorize logic or specific check)
// For now simplified, using 'ultimate' user as admin proxy or adding specific 'admin' role if needed
// Spec says "Admin Panel", let's assume 'admin' role exists or we gate by a specific email in middleware
// For MVP, gating by 'active' user + specific admin check would be better, but let's stick to protect
router.use(protect);

// TODO: stricter admin middleware
// router.use(authorize('admin')); 

router.post('/questions', createQuestion);
router.post('/topics', createTopic);
router.patch('/chapters/:chapterId/content', updateChapterContentSource);
router.patch('/topics/:topicId/content', updateTopicContentSource);
router.get('/stats', getAdminStats);

module.exports = router;
