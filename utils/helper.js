const nodemailer = require("nodemailer");
const admin = require('../config/Firebase');
const Token = require('../models/Token');
const NotificationLog = require('../models/NotificationLog');
const notificationService = require('../services/notificationService');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    // host: "smtp.gmail.com",
    port: process.env.SMTP_PORT,
    secure: process.env.NODE_ENV === "production" ? true : false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    logger: true,
    debug: true,
});

const NOTIFICATION_SCHEDULE = {
    lunch: { hour: 12, minute: 0 },       // 12:00 PM
    dinner: { hour: 20, minute: 0 },      // 8:00 PM
};

const ACTIVE_HOURS = {
    start: 8,  // 8 AM
    end: 21    // 8 PM
};

// Fetch all tokens with valid fcmToken and timezone for notifications
const getUserFcmTokensWithTimezone = async () => {
    try {
        // Find all tokens where fcmToken and timezone are set and not empty, and user has notifications enabled
        const tokens = await Token.find({
            fcmToken: { $exists: true, $ne: null, $ne: "" },
            timezone: { $exists: true, $ne: null, $ne: "" }
        })
            .populate({
                path: 'user',
                match: { isNotificationEnabled: true },
                select: 'isNotificationEnabled'
            })
            .select('fcmToken timezone user')
            .lean();

        // Filter out tokens where user is null (i.e., notifications are disabled)
        return tokens.filter(token => token.user);
    } catch (error) {
        console.error('Error fetching FCM tokens:', error);
        return [];
    }
};

const getMealTimeForUserTimezone = (timezone) => {
    const now = new Date();
    // Get current time in user's timezone
    const userTime = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
    const userHour = userTime.getHours();
    const userMinute = userTime.getMinutes();
    const userDayOfWeek = userTime.getDay(); // 0 = Sunday, 1 = Monday, 2 = Tuesday, etc.

    // console.log(`🕒 [${timezone}] Local time: ${userHour}:${userMinute}, Day: ${userDayOfWeek}`);

    // [Success] FIRST CHECK: Only send on Monday (1), Tuesday (2), Wednesday (3)
    if (userDayOfWeek !== 1 && userDayOfWeek !== 2 && userDayOfWeek !== 3) {
        return null; // Don't send notifications on other days
    }

    // [Success] SECOND CHECK: Active hours (8 AM - 9 PM)
    if (userHour < ACTIVE_HOURS.start || userHour >= ACTIVE_HOURS.end) {
        return null; // Don't send notifications outside active hours
    }

    // [Success] THIRD CHECK: Check if current time matches any of our notification schedules (within 5 minutes)
    for (const [mealType, schedule] of Object.entries(NOTIFICATION_SCHEDULE)) {
        const timeDiff = Math.abs(
            (userHour * 60 + userMinute) - (schedule.hour * 60 + schedule.minute)
        );

        // If within 5 minutes of scheduled time
        if (timeDiff < 5) {
            return mealType;
        }
    }

    return null;
};

// Backward compatibility: generateNotificationContent now uses notification service
const generateNotificationContent = async (mealTimeContext) => {
    // Map legacy meal types to new notification types
    const notificationType = mealTimeContext === 'lunch' ? 'meal_lunch' :
        mealTimeContext === 'dinner' ? 'meal_dinner' :
            mealTimeContext;

    return await notificationService.generateNotificationContent(notificationType);
};

// Use notification service's normalizeTimezone (backward compatibility)
const normalizeTimezone = notificationService.normalizeTimezone;

// Use notification service's getLocalDateStringForTimezone (backward compatibility)
const getLocalDateStringForTimezone = notificationService.getLocalDateStringForTimezone;

// 📌 Utility to check if already sent today (per timezone) - Backward compatibility wrapper
const alreadySentToday = async (userId, mealType, timezone) => {
    // Map legacy mealType to new notification type
    const notificationType = mealType === 'lunch' ? 'meal_lunch' :
        mealType === 'dinner' ? 'meal_dinner' :
            mealType;

    const today = getLocalDateStringForTimezone(timezone);
    // Check both old and new format for backward compatibility
    return await NotificationLog.findOne({
        userId,
        $or: [
            { mealType: mealType },
            { notificationType: notificationType }
        ],
        date: today,
        timezone
    });
};

// 📌 Utility to log after sending (idempotent per user/meal/day/timezone) - Backward compatibility wrapper
const logNotificationSent = async (userId, mealType, timezone) => {
    // Map legacy mealType to new notification type
    const notificationType = mealType === 'lunch' ? 'meal_lunch' :
        mealType === 'dinner' ? 'meal_dinner' :
            mealType;

    // Use notification service's log function
    await notificationService.logNotificationSent(userId, notificationType, timezone);
};

// Backward compatibility: sendNotifications now uses the new notification service
const sendNotifications = async () => {
    // Route to new notification service which handles all notification types
    return await notificationService.sendAllScheduledNotifications();
};

/**
 * Send a push notification to a specific user by userId and userAgent
 * Backward compatibility wrapper - now uses notification service
 * @param {String} userId - The user's MongoDB _id
 * @param {String} title - Notification title
 * @param {String} body - Notification body
 * @param {String} [userAgent] - The user agent string to identify the device (optional)
 * @param {String} [notificationType] - Optional notification type (defaults to 'ai_recipe_ready')
 * @returns {Promise<{success: boolean, error?: any}>}
 */
const sendNotificationToUser = async (userId, title, body, userAgent, notificationType = 'ai_recipe_ready') => {
    // Use notification service for event-driven notifications
    return await notificationService.sendEventNotification(
        userId,
        notificationType,
        title,
        body,
        userAgent
    );
};


module.exports = {
    transporter,
    getUserFcmTokensWithTimezone,
    getMealTimeForUserTimezone,
    generateNotificationContent,
    sendNotifications,
    sendNotificationToUser
};
