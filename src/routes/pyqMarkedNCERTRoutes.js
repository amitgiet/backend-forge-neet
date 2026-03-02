const express = require('express');
const {
  getTopicsBySubject,
  getAllPYQData,
  getTopicById,
  addTopic,
  updateTopic,
  deleteTopic
} = require('../controllers/pyqMarkedNCERTController');
const { protect, authorize } = require('../middleware/auth');
const router = express.Router();

// Public routes
router.get('/all', getAllPYQData);
router.get('/topics', getTopicsBySubject);
router.get('/:topicId', getTopicById);

// Admin routes (protected)
router.use(protect); // All routes below require authentication

router.post('/add', addTopic);
router.put('/:topicId', updateTopic);
router.delete('/:topicId', deleteTopic);

module.exports = router;
