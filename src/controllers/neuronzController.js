const NeuronzService = require('../services/neuronzService');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Clean up invalid UserLines (for development)
// @route   DELETE /api/neuronz/cleanup
// @access  Private
exports.cleanupUserLines = async (req, res, next) => {
    try {
        const userId = req.user.id;
        
        // Delete all UserLines for this user (fresh start)
        const result = await require('../models/UserLine').deleteMany({ userId });
        
        res.status(200).json({
            success: true,
            message: `Deleted ${result.deletedCount} UserLine records. Ready for fresh start!`,
            data: { deletedCount: result.deletedCount }
        });

    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Get due NCERT lines for today
// @route   GET /api/neuronz/due
// @access  Private
exports.getDueLines = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userPlan = req.user.subscription?.plan || 'free';

        const dueData = await NeuronzService.getDueLines(userId, userPlan);

        res.status(200).json({
            success: true,
            data: dueData
        });

    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Process quiz session for a line
// @route   POST /api/neuronz/session
// @access  Private
exports.processLineSession = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { lineId, correctAnswers, totalQuizzes = 4, timeSpent, review } = req.body;

        if (!lineId || typeof correctAnswers !== 'number') {
            return next(new ErrorResponse('Line ID and correct answers count required', 400));
        }

        // Check daily limit for free users
        const userPlan = req.user.subscription?.plan || 'free';
        const limitCheck = await NeuronzService.checkDailyLimit(userId, userPlan);

        if (limitCheck.limitReached) {
            return res.status(200).json({
                success: true,
                limitReached: true,
                message: 'Daily limit reached. Upgrade to Pro for unlimited revisions.',
                attemptsToday: limitCheck.attemptsToday,
                limit: limitCheck.limit
            });
        }

        const result = await NeuronzService.processLineSession(userId, lineId, correctAnswers, totalQuizzes, timeSpent, review);

        res.status(200).json({
            success: true,
            data: result
        });

    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Generate micro-quizzes for an NCERT line
// @route   GET /api/neuronz/quizzes/:lineId
// @access  Private
exports.generateMicroQuizzes = async (req, res, next) => {
    try {
        const { lineId } = req.params;

        const quizzes = await NeuronzService.generateMicroQuizzes(lineId);

        res.status(200).json({
            success: true,
            data: quizzes
        });

    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Get user's NeuronZ statistics
// @route   GET /api/neuronz/stats
// @access  Private
exports.getUserStats = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const stats = await NeuronzService.getUserStats(userId);

        res.status(200).json({
            success: true,
            data: stats
        });

    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Get lines by specific level
// @route   GET /api/neuronz/level/:level
// @access  Private
exports.getLinesByLevel = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { level } = req.params;
        const { limit = 20 } = req.query;

        if (level < 1 || level > 7) {
            return next(new ErrorResponse('Level must be between 1 and 7', 400));
        }

        const lines = await NeuronzService.getLinesByLevel(userId, parseInt(level), parseInt(limit));

        res.status(200).json({
            success: true,
            count: lines.length,
            data: lines
        });

    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Reset line to Level 1
// @route   PUT /api/neuronz/reset/:lineId
// @access  Private
exports.resetLineLevel = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { lineId } = req.params;

        const result = await NeuronzService.resetLineLevel(userId, lineId);

        res.status(200).json({
            success: true,
            message: 'Line reset to Level 1',
            data: result
        });

    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Get mastery progress
// @route   GET /api/neuronz/mastery
// @access  Private
exports.getMasteryProgress = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const progress = await NeuronzService.getMasteryProgress(userId);

        res.status(200).json({
            success: true,
            data: progress
        });

    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Check daily limit status
// @route   GET /api/neuronz/limit
// @access  Private
exports.checkDailyLimit = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userPlan = req.user.subscription?.plan || 'free';

        const limitStatus = await NeuronzService.checkDailyLimit(userId, userPlan);

        res.status(200).json({
            success: true,
            data: limitStatus
        });

    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};



// @desc    Add all lines from a chapter to user's tracking
// @route   POST /api/neuronz/track-chapter
// @access  Private

exports.trackChapter = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const { chapterId } = req.body;


        if (!chapterId) {
            return next(new ErrorResponse('Chapter ID is required', 400));
        }

        const result = await NeuronzService.trackChapterForUser(userId, chapterId);

        res.status(200).json({
            success: true,


            message: `Started tracking ${result.added} new lines.`,
            data: result
        });

    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Track by subject and topic for NeuronZ practice
// @route   POST /api/neuronz/track-topic
// @access  Private
exports.trackBySubjectAndTopic = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { subject, topic } = req.body;

        if (!subject || !topic) {
            return next(new ErrorResponse('Subject and topic are required', 400));
        }

        const result = await NeuronzService.trackBySubjectAndTopic(userId, subject, topic);

        res.status(200).json({
            success: true,
            message: result.message,
            data: result
        });

    } catch (error) {
        next(new ErrorResponse(error.message, error.statusCode || 500));
    }
};

// @desc    Adjust line level manually
// @route   PUT /api/neuronz/:lineId/level
// @access  Private
exports.adjustLineLevel = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { lineId } = req.params;
        const { newLevel, reason } = req.body;

        if (!newLevel || newLevel < 1 || newLevel > 7) {
            return next(new ErrorResponse('Level must be between 1 and 7', 400));
        }

        const result = await NeuronzService.adjustLineLevel(userId, lineId, newLevel, reason);

        res.status(200).json({
            success: true,
            message: `Level adjusted to ${newLevel}`,
            data: result
        });

    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Customize line schedule and priority
// @route   PUT /api/neuronz/:lineId/customize
// @access  Private
exports.customizeSchedule = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { lineId } = req.params;
        const { priority, customSchedule, autoSkipL7 } = req.body;

        const result = await NeuronzService.customizeLineSchedule(
            userId,
            lineId,
            priority,
            customSchedule,
            autoSkipL7
        );

        res.status(200).json({
            success: true,
            message: 'Schedule customized',
            data: result
        });

    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Get line analytics and performance
// @route   GET /api/neuronz/:lineId/analytics
// @access  Private
exports.getLineAnalytics = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { lineId } = req.params;

        const analytics = await NeuronzService.getLineAnalytics(userId, lineId);

        res.status(200).json({
            success: true,
            data: analytics
        });

    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Get topic-level NeuronZ summary
// @route   GET /api/neuronz/topics/summary
// @access  Private
exports.getTopicSummary = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const data = await NeuronzService.getTopicSummary(userId);

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Get due lines for a topic
// @route   GET /api/neuronz/topics/:topicId/due
// @access  Private
exports.getTopicDueLines = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { topicId } = req.params;
        const { sessionSize = 6 } = req.query;

        const data = await NeuronzService.getTopicDueLines(userId, topicId, sessionSize);
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Start baseline session for a topic
// @route   POST /api/neuronz/topics/:topicId/baseline
// @access  Private
exports.startTopicBaseline = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { topicId } = req.params;
        const { baselineSize = 20 } = req.body || {};

        const data = await NeuronzService.startTopicBaseline(userId, topicId, baselineSize);
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Check mapped availability for a subject/topic
// @route   GET /api/neuronz/topics/availability
// @access  Private
exports.getTopicAvailability = async (req, res, next) => {
    try {
        const { subject, topic } = req.query;

        if (!subject || !topic) {
            return next(new ErrorResponse('Subject and topic are required', 400));
        }

        const data = await NeuronzService.getTopicAvailability(subject, topic);
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Get past submissions for a topic
// @route   GET /api/neuronz/topics/:topicId/history
// @access  Private
exports.getTopicSubmissionHistory = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { topicId } = req.params;
        const { limit = 20 } = req.query;

        const data = await NeuronzService.getTopicSubmissionHistory(userId, topicId, limit);
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};
