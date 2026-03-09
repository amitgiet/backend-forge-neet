const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
    listDoubts,
    createDoubt,
    getDoubt,
    updateDoubt,
    deleteDoubt,
    toggleDoubtUpvote,
    addAnswer,
    toggleAnswerUpvote,
    acceptAnswer,
    verifyAnswer,
    resolveDoubt,
} = require('../controllers/doubtController');

router.use(protect);

// Doubt CRUD
router.get('/', listDoubts);
router.post('/', createDoubt);
router.get('/:id', getDoubt);
router.put('/:id', updateDoubt);
router.delete('/:id', deleteDoubt);

// Doubt actions
router.post('/:id/upvote', toggleDoubtUpvote);
router.put('/:id/resolve', resolveDoubt);

// Answer sub-resource
router.post('/:id/answer', addAnswer);
router.post('/:id/answers/:aid/upvote', toggleAnswerUpvote);
router.put('/:id/answers/:aid/accept', acceptAnswer);
router.put('/:id/answers/:aid/verify', verifyAnswer);

module.exports = router;
