const mongoose = require('mongoose');

const UserActivityLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    actionType: {
        type: String,
        required: true,
        index: true
        // Examples: 'curriculum_topic_completed', 'mock_test_submitted', 'formula_memorized', 'session_completed', 'quiz_attempted'
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
        // Stores varied data like { subject: 'physics', chapter: 'kinematics', topic: 'motion in 1D', percentage: 85 }
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: false
});

// A compound index to easily retrieve a user's chronological activities
UserActivityLogSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('UserActivityLog', UserActivityLogSchema);
