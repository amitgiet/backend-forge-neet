const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fcmToken: {
        type: String,
        required: [true, 'Please provide an FCM/Push token'],
        unique: true
    },
    timezone: {
        type: String,
        default: 'UTC'
    },
    userAgent: {
        type: String,
        default: 'mobile_app'
    }
}, {
    timestamps: true
});

// A user can have multiple tokens for different devices, but we'll primarily 
// query by user to send to all their devices.
tokenSchema.index({ user: 1 });

module.exports = mongoose.model('Token', tokenSchema);
