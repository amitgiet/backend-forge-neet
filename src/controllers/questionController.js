const Question = require('../models/Question');
const User = require('../models/User');
const NeuronzService = require('../services/neuronzService');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get questions for practice (Practice Mode)
// @route   GET /api/v1/questions/practice
// @access  Private
exports.getPracticeQuestions = async (req, res, next) => {
    try {
        const { subject, chapterId, topicId, difficulty, limit = 10 } = req.query;

        const query = { isActive: true };
        if (subject) query.subject = subject;
        if (chapterId) query.chapterId = chapterId;
        if (topicId) query.topicId = topicId;
        if (difficulty) query.difficulty = difficulty;

        // Randomize selection
        const questions = await Question.aggregate([
            { $match: query },
            { $sample: { size: parseInt(limit) } }
        ]);

        res.status(200).json({
            success: true,
            count: questions.length,
            data: questions
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get random questions (legacy endpoint for frontend)
// @route   POST /api/v1/questions/random
// @access  Private
exports.getRandomQuestions = async (req, res, next) => {
    try {
        const { chapterId, subject, difficulty, examType, limit = 20 } = req.body || {};
        const questions = await Question.getRandomQuestions(
            { chapterId, subject, difficulty, examType },
            parseInt(limit)
        );

        res.status(200).json({
            success: true,
            count: questions.length,
            data: questions
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get "Due" questions for Spaced Repetition (Neuronz)
// @route   GET /api/v1/questions/neuronz/due
// @access  Private
exports.getNeuronzRevision = async (req, res, next) => {
    try {
        const dueItems = await NeuronzService.getDueQuestions(req.user.id);

        if (!dueItems || dueItems.length === 0) {
            return res.status(200).json({
                success: true,
                message: "No questions due for revision today!",
                data: []
            });
        }

        // Extract Question IDs
        const questionIds = dueItems.map(item => item.questionId);

        // Fetch full question details
        const questions = await Question.find({
            questionId: { $in: questionIds },
            isActive: true
        });

        res.status(200).json({
            success: true,
            count: questions.length,
            data: questions,
            meta: {
                dueCount: dueItems.length
            }
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Submit answer for a single question (Updates Neuronz Level)
// @route   POST /api/v1/questions/submit
// @access  Private
exports.submitQuestion = async (req, res, next) => {
    try {
        const { questionId, selectedOption, timeSpent } = req.body;

        const question = await Question.findOne({ questionId });
        if (!question) return next(new ErrorResponse('Question not found', 404));

        const isCorrect = selectedOption === question.correctAnswer;

        // 1. Update Global Question Stats
        question.updateStats(isCorrect, timeSpent || 0);
        await question.save();

        // 2. Update Neuronz Level (User-specific)
        const updatedProgress = await NeuronzService.updateProgress(req.user.id, questionId, isCorrect);

        // 3. Update generic user analytics
        const user = await User.findById(req.user.id);
        user.analytics.totalQuestionsAttempted += 1;
        if (isCorrect) user.analytics.totalQuestionsCorrect += 1;
        await user.save();

        res.status(200).json({
            success: true,
            isCorrect,
            explanation: question.explanation,
            neuronz: {
                newLevel: updatedProgress.level,
                nextRevision: updatedProgress.nextRevisionDate
            }
        });

    } catch (error) {
        next(error);
    }
};
