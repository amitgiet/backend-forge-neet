const NeuronzService = require('../services/neuronzService');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get due questions grouped by level (L1–L7)
// @route   GET /api/neuronz/due
// @access  Private
exports.getDueQuestions = async (req, res, next) => {
    try {
        const data = await NeuronzService.getDueQuestions(req.user.id);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Get question documents for a specific level (for quiz player)
// @route   GET /api/neuronz/level/:level/questions
// @access  Private
exports.getLevelQuestions = async (req, res, next) => {
    try {
        const { level } = req.params;
        const { limit = 50 } = req.query;
        const levelNum = parseInt(level, 10);
        if (isNaN(levelNum) || levelNum < 1 || levelNum > 7) {
            return next(new ErrorResponse('Level must be between 1 and 7', 400));
        }
        const data = await NeuronzService.getLevelQuestions(req.user.id, levelNum, parseInt(limit, 10));
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Submit answer for a NeuronZ review question
// @route   POST /api/neuronz/review
// @access  Private
exports.reviewQuestion = async (req, res, next) => {
    try {
        const { questionId, wasCorrect, timeSpent = 0 } = req.body;
        if (!questionId || typeof wasCorrect !== 'boolean') {
            return next(new ErrorResponse('questionId (string) and wasCorrect (boolean) are required', 400));
        }
        const result = await NeuronzService.processQuestionAnswer(
            req.user.id,
            questionId,
            wasCorrect,
            timeSpent
        );
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Batch submit answers after completing a level quiz
// @route   POST /api/neuronz/review/batch
// @access  Private
exports.reviewBatch = async (req, res, next) => {
    try {
        const { answers } = req.body; // [{ questionId, wasCorrect, timeSpent }]
        if (!Array.isArray(answers) || answers.length === 0) {
            return next(new ErrorResponse('answers array is required', 400));
        }
        const results = [];
        for (const item of answers) {
            try {
                const r = await NeuronzService.processQuestionAnswer(
                    req.user.id,
                    item.questionId,
                    Boolean(item.wasCorrect),
                    Number(item.timeSpent || 0)
                );
                results.push(r);
            } catch (err) {
                results.push({ questionId: item.questionId, error: err.message });
            }
        }
        res.status(200).json({ success: true, data: results });
    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Get user NeuronZ statistics
// @route   GET /api/neuronz/stats
// @access  Private
exports.getUserStats = async (req, res, next) => {
    try {
        const stats = await NeuronzService.getUserStats(req.user.id);
        res.status(200).json({ success: true, data: stats });
    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Get mastery progress for dashboard
// @route   GET /api/neuronz/mastery
// @access  Private
exports.getMasteryProgress = async (req, res, next) => {
    try {
        const progress = await NeuronzService.getMasteryProgress(req.user.id);
        res.status(200).json({ success: true, data: progress });
    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};
