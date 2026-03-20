const mongoose = require('mongoose');

const notificationLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    notificationType: {
        type: String,
        required: false // Used for new format (e.g., 'meal_breakfast', 'ai_recipe_ready')
    },
    mealType: {
        type: String,
        required: false // Kept for backward compatibility with helper.js
    },
    date: {
        type: String, // String format YYYY-MM-DD
        required: [true, 'Please provide a date']
    },
    timezone: {
        type: String,
        default: 'UTC'
    },
    title: {
        type: String,
        default: null
    },
    body: {
        type: String,
        default: null
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

// Compound unique indexes to prevent multiple notifications of the same type in one day for a user
// First one: userId + date + notificationType + timezone
notificationLogSchema.index(
    { userId: 1, date: 1, notificationType: 1, timezone: 1 },
    { unique: true, partialFilterExpression: { notificationType: { $exists: true, $ne: null } } }
);

// Second one: userId + date + mealType + timezone (for backward compatibility)
notificationLogSchema.index(
    { userId: 1, date: 1, mealType: 1, timezone: 1 },
    { unique: true, partialFilterExpression: { mealType: { $exists: true, $ne: null } } }
);

module.exports = mongoose.model('NotificationLog', notificationLogSchema);
