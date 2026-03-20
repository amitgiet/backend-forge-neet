const admin = require('../src/config/Firebase');
const Token = require('../src/models/Token');
const NotificationLog = require('../src/models/NotificationLog');
const User = require('../src/models/User');
const { NOTIFICATION_PROMPT } = require("../utils/promptTemplates")
const { GoogleGenerativeAI } = require('@google/generative-ai');
const moment = require('moment');

const hasMessagingClient = () => Boolean(admin?.__isConfigured && admin.apps?.length);

/**
 * Notification Type Registry
 * Add new notification types here with their configuration
 */
const NOTIFICATION_TYPES = {
    // Meal reminder notifications (backward compatible)
    MEAL_BREAKFAST: {
        type: 'meal_breakfast',
        legacyType: 'breakfast',
        schedule: { hour: 8, minute: 0 },
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday
        activeHours: { start: 8, end: 21 },
        cooldown: 'daily', // once per day
        enabled: true,
        requiresTimezone: true,
        contentGenerator: 'generateMealNotificationContent'
    },
    MEAL_LUNCH: {
        type: 'meal_lunch',
        legacyType: 'lunch',
        schedule: { hour: 12, minute: 0 },
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday
        activeHours: { start: 8, end: 21 },
        cooldown: 'daily', // once per day
        enabled: true,
        requiresTimezone: true,
        contentGenerator: 'generateMealNotificationContent'
    },
    MEAL_DINNER: {
        type: 'meal_dinner',
        legacyType: 'dinner',
        schedule: { hour: 20, minute: 0 },
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday
        activeHours: { start: 8, end: 21 },
        cooldown: 'daily',
        enabled: true,
        requiresTimezone: true,
        contentGenerator: 'generateMealNotificationContent'
    },
    // Example: Weekly summary notification
    WEEKLY_SUMMARY: {
        type: 'weekly_summary',
        schedule: { hour: 18, minute: 0 },
        daysOfWeek: [0], // Sunday
        activeHours: { start: 8, end: 21 },
        cooldown: 'weekly',
        enabled: false,
        requiresTimezone: true,
        contentGenerator: 'generateWeeklySummaryContent'
    },
    // Example: Recipe trending notification
    RECIPE_TRENDING: {
        type: 'recipe_trending',
        schedule: { hour: 10, minute: 0 },
        daysOfWeek: [1, 3, 5],
        activeHours: { start: 8, end: 21 },
        cooldown: 'daily',
        enabled: false,
        requiresTimezone: true,
        contentGenerator: 'generateTrendingRecipeContent'
    },
    // AI Recipe Ready (event-driven, no schedule)
    AI_RECIPE_READY: {
        type: 'ai_recipe_ready',
        schedule: null, // Event-driven
        cooldown: 'instant', // Uses Redis cooldown
        enabled: true,
        requiresTimezone: false,
        contentGenerator: null // Content provided directly
    },
    // Hydration reminder (event-driven, no schedule; triggered by cron at 3 PM)
    HYDRATION_REMINDER: {
        type: 'hydration_reminder',
        schedule: null,
        cooldown: 'instant',
        enabled: true,
        requiresTimezone: false,
        contentGenerator: null
    },
    // Fasting notifications (event-driven)
    FASTING_REMINDER: {
        type: 'fasting_reminder',
        schedule: null,
        cooldown: 'instant',
        enabled: true,
        requiresTimezone: false,
        contentGenerator: null
    },
    FASTING_PROGRESS: {
        type: 'fasting_progress',
        schedule: null,
        cooldown: 'instant',
        enabled: true,
        requiresTimezone: false,
        contentGenerator: null
    },
    FASTING_COMPLETE: {
        type: 'fasting_complete',
        schedule: null,
        cooldown: 'instant',
        enabled: true,
        requiresTimezone: false,
        contentGenerator: null
    }
};

/**
 * Get notification type config by type or legacy mealType
 */
const getNotificationConfig = (type) => {
    // First try direct match
    const directMatch = Object.values(NOTIFICATION_TYPES).find(
        config => config.type === type
    );
    if (directMatch) return directMatch;

    // Then try legacy mealType match
    const legacyMatch = Object.values(NOTIFICATION_TYPES).find(
        config => config.legacyType === type
    );
    if (legacyMatch) return legacyMatch;

    return null;
};

/**
 * Normalize timezone (backward compatibility)
 */
const normalizeTimezone = (timezone) => {
    if (timezone === 'Asia/Calcutta') return 'Asia/Kolkata';
    return timezone;
};

/**
 * Get local date string for timezone
 */
const getLocalDateStringForTimezone = (timezone) => {
    const now = new Date();
    const tzNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const year = tzNow.getFullYear();
    const month = String(tzNow.getMonth() + 1).padStart(2, '0');
    const day = String(tzNow.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Check if notification should be sent based on schedule
 */
const shouldSendNotification = (config, timezone) => {
    if (!config.schedule) return false; // Event-driven notifications don't have schedules

    const now = new Date();
    const userTime = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
    const userHour = userTime.getHours();
    const userMinute = userTime.getMinutes();
    const userDayOfWeek = userTime.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Check day of week
    if (!config.daysOfWeek.includes(userDayOfWeek)) {
        return false;
    }

    // Check active hours
    if (config.activeHours) {
        if (userHour < config.activeHours.start || userHour >= config.activeHours.end) {
            return false;
        }
    }

    // Check if current time matches schedule (within 5 minutes)
    const timeDiff = Math.abs(
        (userHour * 60 + userMinute) - (config.schedule.hour * 60 + config.schedule.minute)
    );

    return timeDiff < 5;
};

/**
 * Check if notification already sent (duplicate prevention)
 */
const alreadySent = async (userId, notificationType, timezone, cooldown = 'daily', recentMinutes = null) => {
    const today = getLocalDateStringForTimezone(timezone);
    const config = getNotificationConfig(notificationType);
    const legacyType = config?.legacyType;

    // Build query to check both new format and legacy format
    const queryConditions = [
        { notificationType: notificationType },
        { mealType: notificationType } // Backward compatibility - direct legacy type
    ];

    // If this is a new format (like meal_breakfast), also check for legacy type (breakfast)
    if (legacyType && config.type === notificationType) {
        queryConditions.push({ mealType: legacyType });
    }

    // New: Check for recent cooldown (MongoDB based)
    if (recentMinutes) {
        const threshold = moment().subtract(recentMinutes, 'minutes').toDate();
        const log = await NotificationLog.findOne({
            userId,
            $or: queryConditions,
            createdAt: { $gte: threshold }
        });
        return !!log;
    }

    if (cooldown === 'daily') {
        // Check if sent today
        const log = await NotificationLog.findOne({
            userId,
            $or: queryConditions,
            date: today,
            timezone
        });
        return !!log;
    } else if (cooldown === 'weekly') {
        // Check if sent this week
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week (Sunday)
        const weekStartStr = getLocalDateStringForTimezone(timezone);

        const log = await NotificationLog.findOne({
            userId,
            $or: queryConditions,
            date: { $gte: weekStartStr },
            timezone
        });
        return !!log;
    }

    return false;
};

/**
 * Log notification sent
 */
const logNotificationSent = async (userId, notificationType, timezone, metadata = {}) => {
    if (!notificationType) {
        notificationType = 'general';
    }
    const today = getLocalDateStringForTimezone(timezone);
    const normalizedTimezone = normalizeTimezone(timezone);

    // Determine if we should use notificationType or mealType (backward compatibility)
    const config = getNotificationConfig(notificationType);
    // Check if the notificationType passed is a legacy mealType (breakfast/lunch/dinner)
    const isLegacyMealType = notificationType === 'breakfast' || notificationType === 'lunch' || notificationType === 'dinner';
    // Check if config exists and notificationType matches the config type (new format like meal_breakfast)
    const isNewMealType = config && config.legacyType && config.type === notificationType;
    // Or if config exists and has a legacyType that matches (direct legacy type passed)
    const isLegacyType = isLegacyMealType || (config && config.legacyType && config.legacyType === notificationType);

    try {
        const logData = {
            userId,
            date: today,
            timezone: normalizedTimezone,
            // Store basic content for UI if provided
            title: metadata.title || null,
            body: metadata.body || null,
            metadata
        };

        if (isLegacyType) {
            // Use mealType for backward compatibility (breakfast/lunch/dinner passed directly)
            logData.mealType = notificationType;
        } else if (isNewMealType) {
            // Use mealType with legacyType value for backward compatibility (meal_breakfast -> breakfast)
            logData.mealType = config.legacyType;
        } else {
            // Use notificationType for new types without legacy support
            logData.notificationType = notificationType;
        }

        await NotificationLog.updateOne(
            logData,
            { $setOnInsert: logData },
            { upsert: true }
        );
    } catch (err) {
        // Ignore duplicate key errors due to unique index
        if (err && err.code !== 11000) {
            throw err;
        }
    }
};

/**
 * Check if user has notification enabled for specific type
 */
const isNotificationEnabledForUser = async (userId, notificationType) => {
    try {
        const user = await User.findById(userId).select('isNotificationEnabled notificationPreferences');
        if (!user) return false;

        // Global toggle takes precedence
        if (!user.isNotificationEnabled) return false;

        // Check per-type preference
        if (user.notificationPreferences && user.notificationPreferences.has(notificationType)) {
            return user.notificationPreferences.get(notificationType);
        }

        // Default to enabled if global is true and no specific preference
        return true;
    } catch (error) {
        console.error('Error checking notification preference:', error);
        return false;
    }
};

/**
 * Fetch eligible users for notifications
 */
const getEligibleUsers = async (notificationType) => {
    try {
        const config = getNotificationConfig(notificationType);
        if (!config || !config.enabled) return [];

        const query = {
            fcmToken: { $exists: true, $ne: null, $ne: "" }
        };

        if (config.requiresTimezone) {
            query.timezone = { $exists: true, $ne: null, $ne: "" };
        }

        const tokens = await Token.find(query)
            .populate({
                path: 'user',
                select: 'isNotificationEnabled notificationPreferences'
            })
            .select('fcmToken timezone user userAgent')
            .lean();

        // Filter by user notification preferences
        const eligibleTokens = [];
        for (const token of tokens) {
            if (!token.user) continue;

            // const isEnabled = await isNotificationEnabledForUser(
            //     token.user._id,
            //     notificationType
            // );

            if (true) {
                eligibleTokens.push({
                    fcmToken: token.fcmToken,
                    userId: token.user._id,
                    timezone: token.timezone,
                    userAgent: token.userAgent
                });
            }
        }

        return eligibleTokens;
    } catch (error) {
        console.error('Error fetching eligible users:', error);
        return [];
    }
};

/**
 * Generate notification content based on type
 */
const generateNotificationContent = async (notificationType, context = {}) => {
    const config = getNotificationConfig(notificationType);
    if (!config) {
        console.warn(`No config found for notification type: ${notificationType}`);
        return {
            title: '🔥 NEET Forge',
            body: 'You have a new update from NEET Forge! Ready to forge your future?'
        };
    }

    // Route to appropriate content generator
    switch (config.contentGenerator) {
        case 'generateMealNotificationContent':
            return await generateMealNotificationContent(notificationType, context);
        case 'generateWeeklySummaryContent':
            return await generateWeeklySummaryContent(context);
        case 'generateTrendingRecipeContent':
            return await generateTrendingRecipeContent(context);
        default:
            return {
                title: '🔥 NEET Forge',
                body: 'You have a new update from NEET Forge! Ready to forge your future?'
            };
    }
};

/**
 * Generate meal notification content (backward compatible)
 */
const generateMealNotificationContent = async (mealTime, context = {}) => {
    // Normalize mealTime to handle both legacy and new types
    const mealType = mealTime === 'meal_breakfast' ? 'breakfast' :
        mealTime === 'meal_lunch' ? 'lunch' :
            mealTime === 'meal_dinner' ? 'dinner' :
                mealTime;

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

        const prompt = NOTIFICATION_PROMPT(mealType)

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const notificationContent = JSON.parse(jsonMatch[0]);
                if (notificationContent.title && notificationContent.body) {
                    return notificationContent;
                }
            }

            const titleMatch = text.match(/Title:?\s*([^\n]+)/i);
            const bodyMatch = text.match(/Body:?\s*([^\n]+)/i);

            if (titleMatch && bodyMatch) {
                return {
                    title: titleMatch[1].trim(),
                    body: bodyMatch[1].trim()
                };
            }
        } catch (parseError) {
            console.error('Error parsing Gemini response:', parseError);
        }

        return {
            title: '🚀 NEET Forge Daily Goal',
            body: 'Your future is waiting. Keep up your streak, practice a mock, and rank higher today!'
        };
    } catch (error) {
        console.error('Error generating notification content:', error);
        return {
            title: '🚀 NEET Forge Daily Goal',
            body: 'Your future is waiting. Keep up your streak, practice a mock, and rank higher today!'
        };
    }
};

/**
 * Generate weekly summary content (example for future use)
 */
const generateWeeklySummaryContent = async (context = {}) => {
    // TODO: Implement when ready
    return {
        title: 'Your Weekly Cooking Summary!',
        body: 'Check out your cooking achievements this week!'
    };
};

/**
 * Generate trending recipe content (example for future use)
 */
const generateTrendingRecipeContent = async (context = {}) => {
    // TODO: Implement when ready
    return {
        title: 'Trending Recipes!',
        body: 'Discover what everyone is cooking this week!'
    };
};

/**
 * Send scheduled notifications for a specific type
 */
const sendScheduledNotifications = async (notificationType) => {
    const config = getNotificationConfig(notificationType);
    if (!config || !config.enabled) {
        return { sent: 0, skipped: 0, errors: 0 };
    }

    console.log(`📱 Processing ${notificationType} notifications...`);

    const eligibleUsers = await getEligibleUsers(notificationType);
    if (eligibleUsers.length === 0) {
        console.log(`No eligible users for ${notificationType}`);
        return { sent: 0, skipped: 0, errors: 0 };
    }

    const usersToNotify = [];
    const seenTokens = new Set();
    const notifiedUserIds = new Set();

    for (const user of eligibleUsers) {
        if (!user.timezone) continue;
        if (seenTokens.has(user.fcmToken)) continue;

        // Prevent multiple notifications to different devices for the same user
        const userIdStr = user.userId.toString();
        if (notifiedUserIds.has(userIdStr)) continue;

        const normalizedTimezone = normalizeTimezone(user.timezone);

        // Check if should send based on schedule
        if (!shouldSendNotification(config, normalizedTimezone)) {
            continue;
        }

        // Check if already sent (cooldown)
        const alreadySentToday = await alreadySent(
            user.userId,
            notificationType,
            normalizedTimezone,
            config.cooldown
        );

        if (alreadySentToday) {
            console.log(` Skipping ${notificationType} for user ${user.userId}, already sent`);
            continue;
        }

        usersToNotify.push({
            ...user,
            timezone: normalizedTimezone
        });
        seenTokens.add(user.fcmToken);
        notifiedUserIds.add(userIdStr);
    }

    if (usersToNotify.length === 0) {
        console.log(`No users to notify for ${notificationType} at this time`);
        return { sent: 0, skipped: 0, errors: 0 };
    }

    // Generate content
    const content = await generateNotificationContent(notificationType);
    console.log(`Generated content for ${notificationType}:`, content);

    // Send notifications
    const validUsers = usersToNotify.filter(u =>
        typeof u.fcmToken === "string" && u.fcmToken.length > 0
    );

    if (validUsers.length === 0) {
        return { sent: 0, skipped: 0, errors: 0 };
    }

    if (!hasMessagingClient()) {
        console.warn('[Notification] Firebase messaging is not configured; skipping scheduled notifications.');
        return { sent: 0, skipped: validUsers.length, errors: 0 };
    }

    try {
        const response = await admin.messaging().sendEachForMulticast({
            tokens: validUsers.map(u => u.fcmToken),
            notification: {
                title: content.title,
                body: content.body,
            },
        });

        // Log successful sends
        const userTzToSuccess = new Map();
        response.responses.forEach((resp, idx) => {
            const { userId, timezone } = validUsers[idx];
            const key = `${userId}::${timezone}`;
            if (!userTzToSuccess.has(key)) userTzToSuccess.set(key, false);
            if (resp.success) {
                userTzToSuccess.set(key, true);
            }
        });

        // Log notifications
        for (const [key, didSucceed] of userTzToSuccess.entries()) {
            if (!didSucceed) continue;
            const [userId, timezone] = key.split('::');
            await logNotificationSent(userId, notificationType, timezone, {
                title: content.title,
                body: content.body
            });
        }

        const sent = response.successCount;
        const errors = response.failureCount;

        console.log(`[Success] ${notificationType}: ${sent}/${validUsers.length} sent, ${errors} failed`);

        return { sent, skipped: 0, errors };
    } catch (error) {
        console.error(`[Error] Error sending ${notificationType} notifications:`, error);
        return { sent: 0, skipped: 0, errors: validUsers.length };
    }
};

/**
 * Send all scheduled notifications (checks all enabled types)
 */
const sendAllScheduledNotifications = async () => {
    console.log('xChecking for scheduled notifications...');

    const results = {};
    const enabledTypes = Object.values(NOTIFICATION_TYPES).filter(
        config => config.enabled && config.schedule
    );

    for (const config of enabledTypes) {
        try {
            results[config.type] = await sendScheduledNotifications(config.type);
        } catch (error) {
            console.error(`Error processing ${config.type}:`, error);
            results[config.type] = { sent: 0, skipped: 0, errors: 1 };
        }
    }

    return results;
};

/**
 * Send event-driven notification to a specific user
 */
const sendEventNotification = async (userId, notificationType, title, body, userAgent = null, metadata = {}) => {
    const config = getNotificationConfig(notificationType);

    // Backward compatibility: If notification type not in registry, still send (for old code)
    // if (config) {
    //     if (!config.enabled) {
    //         return { success: false, error: 'Notification type not enabled' };
    //     }

    //     // Check if user has this notification type enabled (only if config exists)
    //     // const isEnabled = await isNotificationEnabledForUser(userId, notificationType);
    //     // if (!isEnabled) {
    //     //     return { success: false, skipped: true, reason: 'User has disabled this notification type' };
    //     // }
    // } else {
    //     // For unknown notification types (backward compatibility), check global notification setting
    //     const User = require('../models/User');
    //     const user = await User.findById(userId).select('isNotificationEnabled');
    //     if (!user || !user.isNotificationEnabled) {
    //         return { success: false, skipped: true, reason: 'User has notifications disabled' };
    //     }
    // }

    // MongoDB-based Cooldown check (prevent multiple notifications in short window)
    const COOLDOWN_MINUTES = 10;
    const isRecentlySent = await alreadySent(userId, notificationType, 'UTC', null, COOLDOWN_MINUTES);

    if (isRecentlySent) {
        console.log(`[Notification] Skipping ${notificationType} for user ${userId}, sent within last ${COOLDOWN_MINUTES}m`);
        return { success: false, skipped: true, reason: 'Notification already sent recently' };
    }

    if (!hasMessagingClient()) {
        return { success: false, skipped: true, reason: 'Firebase messaging is not configured' };
    }

    try {
        const query = { user: userId, fcmToken: { $exists: true, $ne: null, $ne: "" } };
        if (userAgent) query.userAgent = userAgent;

        const tokenDoc = await Token.findOne(query);

        if (!tokenDoc || !tokenDoc.fcmToken) {
            return { success: false, error: 'No FCM token found' };
        }

        const response = await admin.messaging().sendEachForMulticast({
            tokens: [tokenDoc.fcmToken],
            notification: { title, body },
            android: {
                notification: {
                    tag: notificationType, // Use notification type as tag for collapsing
                },
            },
        });

        if (response.successCount > 0) {
            // Log the notification even if type is not in the registry
            const timezone = tokenDoc.timezone || 'UTC';
            const logMetadata = {
                title: metadata.title || title || null,
                body: metadata.body || body || null,
                ...metadata
            };
            await logNotificationSent(userId, notificationType, timezone, logMetadata);
            return { success: true };
        } else {
            return { success: false, error: response.responses[0]?.error };
        }
    } catch (error) {
        console.error('Error sending event notification:', error);
        return { success: false, error };
    }
};


const cleanOldNotifications = async () => {
    try {
        const oneMonthAgo = moment().subtract(1, 'month').toDate();

        const result = await NotificationLog.deleteMany({
            createdAt: { $lt: oneMonthAgo }
        });

        console.log(`Notification cleanup: Deleted ${result.deletedCount} notifications older than 1 month.`);
    } catch (error) {
        console.error('Error cleaning old notifications:', error);
    }
};



module.exports = {
    NOTIFICATION_TYPES,
    getNotificationConfig,
    sendScheduledNotifications,
    sendAllScheduledNotifications,
    sendEventNotification,
    generateNotificationContent,
    isNotificationEnabledForUser,
    logNotificationSent,
    normalizeTimezone,
    getLocalDateStringForTimezone,
    cleanOldNotifications,
};

