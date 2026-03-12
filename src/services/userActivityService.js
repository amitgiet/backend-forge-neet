const UserActivityLog = require('../models/UserActivityLog');

class UserActivityService {
    /**
     * Log a new activity for a user
     * @param {string} userId - The user's ID
     * @param {string} actionType - E.g., 'mock_test_submitted', 'curriculum_topic_completed'
     * @param {object} metadata - Details about the action
     */
    static async logActivity(userId, actionType, metadata = {}) {
        try {
            await UserActivityLog.create({
                userId,
                actionType,
                metadata
            });
        } catch (error) {
            console.error('Failed to log user activity:', error);
            // Non-blocking, so we don't throw
        }
    }

    /**
     * Retrieve the recent timeline of a user
     * @param {string} userId
     * @param {number} limit 
     * @param {number} days 
     * @returns {Array} List of formatted activity logs
     */
    static async getUserTimeline(userId, limit = 20, days = 7) {
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - days);

        const logs = await UserActivityLog.find({
            userId,
            createdAt: { $gte: sinceDate }
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

        return logs.map(log => ({
            actionType: log.actionType,
            metadata: log.metadata,
            timestamp: log.createdAt
        }));
    }
}

module.exports = UserActivityService;
