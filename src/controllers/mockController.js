const MockTest = require('../models/MockTest');
const TestAttempt = require('../models/TestAttempt');
const MockTestProgress = require('../models/MockTestProgress');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get all mock tests available for the user
// @route   GET /api/v1/mocks
// @access  Private
exports.getMockTests = async (req, res, next) => {
    try {
        const { examType, testType, classCategory, freeOnly } = req.query;
        const accessLevel = req.user.subscription.plan;

        let tests = await MockTest.getTestsByExam(
            examType || req.user.primaryExam || 'NEET_UG',
            testType,
            accessLevel
        );

        if (classCategory && classCategory !== 'all') {
            tests = tests.filter((t) => t.classCategory === classCategory);
        }
        if (freeOnly === 'true') {
            tests = tests.filter((t) => t.accessType === 'FREE');
        }

        const testIds = tests.map((t) => t.testId);
        const progressDocs = await MockTestProgress.find({
            userId: req.user.id,
            testId: { $in: testIds }
        }).lean();
        const progressMap = new Map(progressDocs.map((p) => [p.testId, p]));

        const data = tests.map((t) => {
            const p = progressMap.get(t.testId);
            return {
                ...t.toObject(),
                progress: {
                    completed: Boolean(p?.completed),
                    completedAt: p?.completedAt || null
                }
            };
        });

        res.status(200).json({
            success: true,
            count: data.length,
            data
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get mock completion progress for current user
// @route   GET /api/v1/mocks/progress
// @access  Private
exports.getMockProgress = async (req, res, next) => {
    try {
        const rows = await MockTestProgress.find({ userId: req.user.id }).lean();
        res.status(200).json({ success: true, count: rows.length, data: rows });
    } catch (error) {
        next(error);
    }
};

// @desc    Mark mock completed / uncompleted
// @route   POST /api/v1/mocks/:id/complete
// @access  Private
exports.markMockCompleted = async (req, res, next) => {
    try {
        const test = await MockTest.findById(req.params.id).select('testId');
        if (!test) {
            return next(new ErrorResponse(`Mock test not found with id of ${req.params.id}`, 404));
        }

        const completed = req.body?.completed !== false;
        const progress = await MockTestProgress.findOneAndUpdate(
            { userId: req.user.id, testId: test.testId },
            {
                $set: {
                    completed,
                    completedAt: completed ? new Date() : null,
                    notes: String(req.body?.notes || '')
                }
            },
            { new: true, upsert: true }
        );

        res.status(200).json({ success: true, data: progress });
    } catch (error) {
        next(error);
    }
};

// @desc    Start a mock test attempt
// @route   POST /api/v1/mocks/:id/start
// @access  Private
exports.startTestAttempt = async (req, res, next) => {
    try {
        const test = await MockTest.findById(req.params.id);

        if (!test) {
            return next(new ErrorResponse(`Mock test not found with id of ${req.params.id}`, 404));
        }

        // Check if user has access to this test
        const plan = req.user.subscription.plan;
        if (test.accessType === 'PRO' && plan === 'free') {
            return next(new ErrorResponse('This test requires a Pro subscription', 403));
        }

        // Create a new test attempt
        const attempt = await TestAttempt.create({
            userId: req.user.id,
            testId: test.testId,
            attemptNumber: (await TestAttempt.countDocuments({ userId: req.user.id, testId: test.testId })) + 1,
            score: {
                totalQuestions: test.config.totalQuestions,
                totalMarks: test.config.totalMarks
            }
        });

        res.status(201).json({
            success: true,
            data: attempt
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Submit a mock test attempt
// @route   POST /api/v1/mocks/attempt/:attemptId/submit
// @access  Private
exports.submitTestAttempt = async (req, res, next) => {
    try {
        const { responses, timeSpent } = req.body;
        let attempt = await TestAttempt.findById(req.params.attemptId);

        if (!attempt) return next(new ErrorResponse('Attempt not found', 404));

        attempt.responses = responses;
        attempt.timeSpent = timeSpent;
        attempt.status = 'COMPLETED';
        attempt.submittedAt = new Date();

        // Perform scoring and analysis
        await attempt.calculateScore();
        await attempt.analyzeByChapter();

        await attempt.save();

        // Update user analytics
        const User = require('../models/User');
        const user = await User.findById(req.user.id);
        user.analytics.totalMocksAttempted += 1;
        user.analytics.totalQuestionsAttempted += attempt.score.attempted;
        user.analytics.totalQuestionsCorrect += attempt.score.correct;
        user.analytics.overallAccuracy = user.calculateOverallAccuracy();

        // Update streaks and XP
        user.updateStreak();
        user.gamification.totalXP += 300; // Flat XP for mock completion
        user.gamification.coins += 50;

        await user.save();

        res.status(200).json({
            success: true,
            data: attempt
        });
    } catch (error) {
        next(error);
    }
};
