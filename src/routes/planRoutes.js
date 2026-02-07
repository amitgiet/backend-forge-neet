const express = require('express');
const { getStudyPlan, generatePlan, updateTaskStatus } = require('../controllers/planController');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.use(protect);

router.get('/', getStudyPlan);
router.post('/generate', generatePlan);
router.put('/task/:taskId', updateTaskStatus);

module.exports = router;
