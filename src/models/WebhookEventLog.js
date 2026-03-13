const mongoose = require('mongoose');

const WebhookEventLogSchema = new mongoose.Schema(
    {
        provider: {
            type: String,
            required: true,
            default: 'razorpay'
        },
        eventId: {
            type: String,
            required: true,
            unique: true
        },
        eventType: {
            type: String,
            required: true
        },
        payloadHash: {
            type: String,
            required: true
        },
        processedAt: {
            type: Date,
            default: Date.now
        },
        status: {
            type: String,
            enum: ['processed', 'ignored', 'failed'],
            required: true
        },
        errorMessage: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model('WebhookEventLog', WebhookEventLogSchema);
