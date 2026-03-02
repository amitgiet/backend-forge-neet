const mongoose = require('mongoose');
const { Schema } = mongoose;

const AIUsageSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    model: { type: String, required: true },
    promptType: { type: String },
    tokensUsed: { type: Number, default: null },
    costEstimate: { type: Number, default: null },
    meta: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AIUsage', AIUsageSchema);
