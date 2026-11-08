const mongoose = require('mongoose');
const { Schema } = mongoose;

const AIUsageSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    model: { type: String, default: 'gemini-2.5-flash-lite' },
    service: { type: String, default: 'doubt_solver' },
    promptType: { type: String },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    tokensUsed: { type: Number, default: null },
    costEstimate: { type: Number, default: null },
    latencyMs: { type: Number, default: null },
    dataAvailability: { type: String, default: null },
    toolErrors: { type: [String], default: [] },
    feedbackRating: { type: String, enum: ['up', 'down', null], default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    meta: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AIUsage', AIUsageSchema);
