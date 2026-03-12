const express = require('express');
const { getUserTimeline } = require('../controllers/userActivityController');

const router = express.Router();

const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/flow', getUserTimeline);

module.exports = router;
