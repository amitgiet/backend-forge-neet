const express = require('express');
const router = express.Router();
const learningPathController = require('../controllers/learningPathController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.post('/', learningPathController.createPath);
router.get('/', learningPathController.getUserPaths);
router.get('/:pathId', learningPathController.getPathById);
router.get('/:pathId/next', learningPathController.getNextContent);
router.post('/:pathId/complete/:contentIndex', learningPathController.markContentComplete);
router.patch('/:pathId/progress', learningPathController.updateProgress);
router.delete('/:pathId', learningPathController.deletePath);

module.exports = router;
