const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  startRevision,
  completeRevision,
  getDueRevisions,
  getRevisions,
  getAnalytics,
  setExamDates
} = require('../controllers/revisionController');

router.use(protect);

router.post('/start', startRevision);
router.post('/:revisionId/complete', completeRevision);
router.get('/due', getDueRevisions);
router.get('/', getRevisions);
router.get('/analytics', getAnalytics);
router.post('/exam-dates', setExamDates);

module.exports = router;
