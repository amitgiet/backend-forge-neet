const express = require('express');
const { getMockTests, startTestAttempt, submitTestAttempt } = require('../controllers/mockController');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.use(protect);

router.get('/', getMockTests);
router.post('/:id/start', startTestAttempt);
router.post('/attempt/:attemptId/submit', submitTestAttempt);

module.exports = router;
