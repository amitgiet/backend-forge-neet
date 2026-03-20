const cron = require('node-cron');
const moment = require('moment-timezone');
const Token = require('../models/Token');
const DailyChallenge = require('../models/DailyChallenge');
const NotificationLog = require('../models/NotificationLog');
const NotificationService = require('./notificationService');

class CronService {
    static initialize() {
        console.log('⏳ Starting Notification Cron Services');

        // Run every 15 minutes to check local time blocks
        cron.schedule('*/15 * * * *', async () => {
            await this.processLocalTimeNotifications();
        });
    }

    static async processLocalTimeNotifications() {
        try {
            // Find all tokens with populated users
            const tokens = await Token.find({}).populate('user');

            for (const token of tokens) {
                if (!token.user) continue;

                const userTz = token.timezone || 'Asia/Kolkata';
                const localMoment = moment().tz(userTz);
                const currentHour = localMoment.hour();
                const currentMinute = localMoment.minute();
                const dateStr = localMoment.format('YYYY-MM-DD');

                // Enforce Quiet Hours (10 PM to 7 AM)
                if (currentHour >= 22 || currentHour < 7) {
                    continue;
                }

                // Check Global Limit (Max 3 automated notifications per day)
                const todaysAutomatedCount = await NotificationLog.countDocuments({
                    userId: token.user._id,
                    date: dateStr,
                    notificationType: { $in: ['daily_challenge_reminder', 'neuronz_review_reminder', 'mock_test_reminder'] }
                });

                if (todaysAutomatedCount >= 3) {
                    continue;
                }

                // Trigger 5 PM Daily Challenge reminder
                if (currentHour === 17 && currentMinute < 15) {
                    await this.sendDailyChallengeReminder(token.user, dateStr, userTz);
                }

                // Trigger 8 AM NeuronZ reminder
                if (currentHour === 8 && currentMinute < 15) {
                    await this.sendNeuronZReminder(token.user, dateStr, userTz);
                }

                // Weekend Mock Test reminder at 10 AM
                if ((localMoment.day() === 0 || localMoment.day() === 6) && currentHour === 10 && currentMinute < 15) {
                    await this.sendMockTestReminder(token.user, dateStr, userTz);
                }
            }
        } catch (error) {
            console.error('Error processing cron notifications:', error);
        }
    }

    static async sendDailyChallengeReminder(user, dateStr, timezone) {
        // Prevent duplicate logs today
        const logExists = await NotificationLog.findOne({
            userId: user._id,
            notificationType: 'daily_challenge_reminder',
            date: dateStr
        });
        if (logExists) return;

        // Check completion status
        const hasCompleted = await DailyChallenge.hasUserCompletedToday(user._id);
        if (hasCompleted) return;

        // Send Notification
        const result = await NotificationService.sendEventNotification(
            user._id,
            'daily_challenge_reminder',
            '🔥 Keep your streak alive!',
            'Today\'s Daily Challenge is waiting for you.',
            null, // userAgent neutral to hit all devices
            { date: dateStr } // metadata
        );

        if (result.success) {
            await NotificationLog.create({
                userId: user._id,
                notificationType: 'daily_challenge_reminder',
                date: dateStr,
                timezone: timezone,
                title: '🔥 Keep your streak alive!',
                body: 'Today\'s Daily Challenge is waiting for you.'
            });
        }
    }

    static async sendNeuronZReminder(user, dateStr, timezone) {
        const logExists = await NotificationLog.findOne({
            userId: user._id,
            notificationType: 'neuronz_review_reminder',
            date: dateStr
        });
        if (logExists) return;

        const result = await NotificationService.sendEventNotification(
            user._id,
            'neuronz_review_reminder',
            '🧠 Strengthen your memory!',
            'You have NCERT questions due for review today.',
            null,
            { date: dateStr }
        );

        if (result.success) {
            await NotificationLog.create({
                userId: user._id,
                notificationType: 'neuronz_review_reminder',
                date: dateStr,
                timezone: timezone,
                title: '🧠 Strengthen your memory!',
                body: 'You have NCERT questions due for review today.'
            });
        }
    }

    static async sendMockTestReminder(user, dateStr, timezone) {
        const logExists = await NotificationLog.findOne({
            userId: user._id,
            notificationType: 'mock_test_reminder',
            date: dateStr
        });
        if (logExists) return;

        const result = await NotificationService.sendEventNotification(
            user._id,
            'mock_test_reminder',
            '🎯 Weekend Mock Test!',
            'Your mock test is ready. Time to evaluate your prep!',
            null,
            { date: dateStr }
        );

        if (result.success) {
            await NotificationLog.create({
                userId: user._id,
                notificationType: 'mock_test_reminder',
                date: dateStr,
                timezone: timezone,
                title: '🎯 Weekend Mock Test!',
                body: 'Your mock test is ready. Time to evaluate your prep!'
            });
        }
    }
}

module.exports = CronService;
