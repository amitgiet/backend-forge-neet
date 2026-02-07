const mongoose = require('mongoose');

const StudyPlanSchema = new mongoose.Schema({
    // User reference
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Plan metadata
    title: {
        type: String,
        required: true
    },

    examType: {
        type: String,
        enum: ['NEET_UG', 'JEE_MAIN', 'JEE_ADVANCED', 'BITSAT', 'AIIMS'],
        required: true
    },

    targetDate: {
        type: Date,
        required: true
    },

    // Plan duration
    startDate: {
        type: Date,
        required: true,
        default: Date.now
    },

    endDate: {
        type: Date,
        required: true
    },

    // Generation mode
    generationMode: {
        type: String,
        enum: ['AI_GENERATED', 'MANUAL', 'TEMPLATE'],
        default: 'AI_GENERATED'
    },

    // Daily schedule
    dailySchedule: {
        studyHoursPerDay: { type: Number, required: true, min: 1, max: 18 },

        // Time blocks
        morningSlot: {
            enabled: { type: Boolean, default: true },
            startTime: { type: String, default: '06:00' }, // HH:MM
            endTime: { type: String, default: '09:00' },
            subjects: [String] // ['physics', 'chemistry']
        },

        afternoonSlot: {
            enabled: { type: Boolean, default: true },
            startTime: { type: String, default: '14:00' },
            endTime: { type: String, default: '17:00' },
            subjects: [String]
        },

        eveningSlot: {
            enabled: { type: Boolean, default: true },
            startTime: { type: String, default: '18:00' },
            endTime: { type: String, default: '21:00' },
            subjects: [String]
        },

        nightSlot: {
            enabled: { type: Boolean, default: false },
            startTime: { type: String, default: '22:00' },
            endTime: { type: String, default: '23:30' },
            subjects: [String]
        }
    },

    // Weekly goals
    weeklyGoals: {
        chaptersToComplete: { type: Number, default: 5 },
        mocksToAttempt: { type: Number, default: 2 },
        questionsToSolve: { type: Number, default: 300 },
        revisionSessions: { type: Number, default: 3 }
    },

    // Energy-based scheduling (AI-optimized)
    energyBasedScheduling: {
        enabled: { type: Boolean, default: true },

        // Peak energy time (for difficult chapters)
        peakEnergySlots: [{
            startTime: String,
            endTime: String,
            preferredSubjects: [String]
        }],

        // Low energy time (for revision)
        lowEnergySlots: [{
            startTime: String,
            endTime: String,
            activities: [String] // ['revision', 'light_practice']
        }]
    },

    // Chapter-wise plan
    chapters: [{
        chapterId: { type: String, required: true },
        subject: { type: String, required: true },
        priority: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW'], default: 'MEDIUM' },

        // Timeline
        scheduledStartDate: { type: Date },
        scheduledEndDate: { type: Date },
        actualStartDate: { type: Date },
        actualEndDate: { type: Date },

        // Time allocation
        estimatedHours: { type: Number, required: true },
        actualHours: { type: Number, default: 0 },

        // Status
        status: {
            type: String,
            enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'],
            default: 'NOT_STARTED'
        },

        // Tasks
        tasks: [{
            type: { type: String, enum: ['NCERT_READING', 'VIDEO_LECTURE', 'PRACTICE', 'MOCK', 'REVISION'] },
            title: String,
            duration: Number, // minutes
            isCompleted: { type: Boolean, default: false },
            completedAt: Date
        }],

        // Revision schedule (spaced repetition)
        revisions: [{
            scheduledDate: { type: Date, required: true },
            completedDate: Date,
            isCompleted: { type: Boolean, default: false },
            intervalDays: { type: Number, required: true } // 1, 3, 7, 15, 30
        }]
    }],

    // Daily tasks (auto-generated)
    dailyTasks: [{
        date: { type: Date, required: true },

        tasks: [{
            chapterId: String,
            subject: String,
            taskType: { type: String, enum: ['STUDY', 'PRACTICE', 'MOCK', 'REVISION', 'BREAK'] },
            title: String,
            duration: Number, // minutes
            timeSlot: String, // 'morning', 'afternoon', 'evening', 'night'
            startTime: String,
            endTime: String,
            isCompleted: { type: Boolean, default: false },
            completedAt: Date,
            actualDuration: Number
        }],

        dailyGoal: {
            studyHours: { type: Number, required: true },
            completedHours: { type: Number, default: 0 },
            percentage: { type: Number, default: 0 }
        }
    }],

    // Progress tracking
    progress: {
        totalChapters: { type: Number, required: true },
        completedChapters: { type: Number, default: 0 },
        inProgressChapters: { type: Number, default: 0 },

        totalHours: { type: Number, required: true },
        completedHours: { type: Number, default: 0 },

        overallProgress: { type: Number, default: 0 }, // 0-100%

        // Subject-wise progress
        subjects: [{
            subject: String,
            totalChapters: Number,
            completedChapters: Number,
            progress: Number
        }]
    },

    // AI recommendations (updated weekly)
    recommendations: [{
        type: { type: String, enum: ['FOCUS_AREA', 'SLOW_DOWN', 'SPEED_UP', 'REVISION_NEEDED'] },
        message: String,
        chapterIds: [String],
        priority: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW'] },
        createdAt: { type: Date, default: Date.now }
    }],

    // Streak tracking
    streak: {
        current: { type: Number, default: 0 },
        longest: { type: Number, default: 0 },
        lastStudyDate: Date
    },

    // Plan status
    status: {
        type: String,
        enum: ['ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED'],
        default: 'ACTIVE'
    },

    isActive: {
        type: Boolean,
        default: true
    }

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes
StudyPlanSchema.index({ userId: 1, status: 1 });
StudyPlanSchema.index({ examType: 1 });
StudyPlanSchema.index({ 'dailyTasks.date': 1 });

// Method to get today's tasks
StudyPlanSchema.methods.getTodaysTasks = function () {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.dailyTasks.find(dt => {
        const taskDate = new Date(dt.date);
        taskDate.setHours(0, 0, 0, 0);
        return taskDate.getTime() === today.getTime();
    });
};

// Method to update progress
StudyPlanSchema.methods.updateProgress = function () {
    let completedChapters = 0;
    let inProgressChapters = 0;
    let completedHours = 0;

    this.chapters.forEach(ch => {
        if (ch.status === 'COMPLETED') {
            completedChapters++;
            completedHours += ch.actualHours || ch.estimatedHours;
        } else if (ch.status === 'IN_PROGRESS') {
            inProgressChapters++;
            completedHours += ch.actualHours || 0;
        }
    });

    this.progress.completedChapters = completedChapters;
    this.progress.inProgressChapters = inProgressChapters;
    this.progress.completedHours = completedHours;
    this.progress.overallProgress = Math.round(
        (completedChapters / this.progress.totalChapters) * 100
    );
};

// Method to check if on track
StudyPlanSchema.methods.isOnTrack = function () {
    const today = new Date();
    const totalDays = Math.ceil((this.endDate - this.startDate) / (1000 * 60 * 60 * 24));
    const daysPassed = Math.ceil((today - this.startDate) / (1000 * 60 * 60 * 24));

    const expectedProgress = (daysPassed / totalDays) * 100;
    const actualProgress = this.progress.overallProgress;

    return actualProgress >= (expectedProgress - 10); // 10% tolerance
};

module.exports = mongoose.model('StudyPlan', StudyPlanSchema);
