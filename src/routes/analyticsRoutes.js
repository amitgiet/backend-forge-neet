const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
    getSubjectAccuracy,
    getAccuracyTrend,
    getWeaknessHeatmap,
} = require('../controllers/analyticsController');

router.use(protect);

// GET /api/v1/analytics/subject-accuracy
router.get('/subject-accuracy', getSubjectAccuracy);

// GET /api/v1/analytics/accuracy-trend?weeks=8
router.get('/accuracy-trend', getAccuracyTrend);

// GET /api/v1/analytics/weakness-heatmap?subject=biology
router.get('/weakness-heatmap', getWeaknessHeatmap);

module.exports = router;
