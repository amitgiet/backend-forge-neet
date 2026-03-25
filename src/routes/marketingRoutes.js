const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { trackDownloadClick, getDownloadStats } = require('../controllers/marketingController');

// Public – called from the marketing website when user clicks Download
router.post('/track-download-click', trackDownloadClick);

// Admin only – view aggregated stats
router.get('/download-stats', protect, getDownloadStats);

module.exports = router;
