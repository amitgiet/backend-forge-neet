const mongoose = require('mongoose');

const LearningPathSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    title: {
        type: String,
        required: true,
        maxlength: 200
    },
    
    description: {
        type: String,
        maxlength: 1000
    },
    
    // User-defined learning goals
    goals: [{
        topic: { type: String, required: true },
        subject: { type: String, enum: ['physics', 'chemistry', 'biology', 'mathematics'] },
        targetDate: Date,
        completed: { type: Boolean, default: false }
    }],
    
    // AI-generated content based on goals
    generatedContent: [{
        contentType: { type: String, enum: ['ncert_line', 'concept', 'practice'], required: true },
        lineId: { type: mongoose.Schema.Types.ObjectId, ref: 'NCERTLine' },
        topic: String,
        order: Number,
        status: { type: String, enum: ['pending', 'in_progress', 'completed'], default: 'pending' }
    }],
    
    // Progress tracking
    progress: {
        totalItems: { type: Number, default: 0 },
        completedItems: { type: Number, default: 0 },
        currentIndex: { type: Number, default: 0 }
    },
    
    // Settings
    dailyGoal: {
        type: Number,
        default: 10,
        min: 1,
        max: 100
    },
    
    isActive: {
        type: Boolean,
        default: true
    },
    
    startedAt: Date,
    completedAt: Date
    
}, {
    timestamps: true
});

LearningPathSchema.index({ userId: 1, isActive: 1 });

module.exports = mongoose.model('LearningPath', LearningPathSchema);
