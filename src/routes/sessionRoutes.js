const express = require('express');
const { startSession, endSession } = require('../controllers/sessionController');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.use(protect);

router.post('/start', startSession);
router.put('/:id/end', endSession);

module.exports = router;
