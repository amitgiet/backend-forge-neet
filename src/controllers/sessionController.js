const StudySession = require('../models/StudySession');
const User = require('../models/User');

// @desc    Start study session
// @route   POST /api/v1/sessions/start
// @access  Private
exports.startSession = async (req, res, next) => {
    try {
        const { subject, chapterId, topicId, focusMode } = req.body;

        const session = await StudySession.create({
            userId: req.user.id,
            subject,
            chapterId,
            topicId,
            focusMode
        });

        res.status(201).json({
            success: true,
            data: session
        });
    } catch (error) {
        next(error);
    }
};

// @desc    End study session
// @route   PUT /api/v1/sessions/:id/end
// @access  Private
exports.endSession = async (req, res, next) => {
    try {
        const session = await StudySession.findById(req.params.id);

        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        session.endTime = new Date();
        session.duration = Math.round((session.endTime - session.startTime) / (1000 * 60)); // In minutes
        session.status = 'COMPLETED';

        // Add custom stats from body if needed
        if (req.body.questionsSolved) session.questionsSolved = req.body.questionsSolved;

        await session.save();

        // Update user stats
        const user = await User.findById(req.user.id);
        user.analytics.totalStudyTime += session.duration;
        user.recentSessions.push(session._id);
        if (user.recentSessions.length > 10) user.recentSessions.shift();

        await user.save();

        const UserActivityService = require('../services/userActivityService');
        await UserActivityService.logActivity(req.user.id, 'session_completed', {
            sessionId: session._id,
            subject: session.subject,
            duration: session.duration,
            questionsSolved: session.questionsSolved
        });

        res.status(200).json({
            success: true,
            data: session
        });
    } catch (error) {
        next(error);
    }
};
