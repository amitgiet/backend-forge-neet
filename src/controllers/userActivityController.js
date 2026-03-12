const UserActivityService = require('../services/userActivityService');
const ErrorResponse = require('../utils/errorResponse');

/**
 * @desc    Get user activity timeline / study flow
 * @route   GET /api/v1/activities/flow
 * @access  Private
 */
exports.getUserTimeline = async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 20;
        const days = parseInt(req.query.days, 10) || 7;

        const timeline = await UserActivityService.getUserTimeline(req.user.id, limit, days);

        res.status(200).json({
            success: true,
            data: timeline
        });
    } catch (error) {
        next(error);
    }
};
