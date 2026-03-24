const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const UserSchema = new mongoose.Schema({
    // Basic Information
    name: {
        type: String,
        required: [true, 'Please provide a name'],
        trim: true,
        maxlength: [50, 'Name cannot exceed 50 characters']
    },

    email: {
        type: String,
        required: [true, 'Please provide an email'],
        unique: true,
        lowercase: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please provide a valid email'
        ]
    },

    password: {
        type: String,
        required: [true, 'Please provide a password'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false // Don't return password in queries by default
    },

    phone: {
        type: String,
        match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit phone number']
    },

    // Exam Preferences (Multi-exam support)
    exams: [{
        examType: {
            type: String,
            enum: ['NEET_UG', 'JEE_MAIN', 'JEE_ADVANCED', 'BITSAT', 'AIIMS'],
            required: true
        },
        targetYear: { type: Number, required: true },
        targetScore: { type: Number },
        isActive: { type: Boolean, default: true }
    }],

    // Primary exam (for dashboard focus)
    primaryExam: {
        type: String,
        enum: ['NEET_UG', 'JEE_MAIN', 'JEE_ADVANCED', 'BITSAT', 'AIIMS'],
        default: 'NEET_UG'
    },

    // Profile Details
    profile: {
        class: { type: Number, enum: [11, 12, 13], default: 12 },
        coachingInstitute: { type: String, enum: ['Allen', 'Aakash', 'FIITJEE', 'Resonance', 'Self-Study', 'Other'] },
        preferredLanguage: { type: String, enum: ['en', 'hi'], default: 'hi' },
        studyHoursPerDay: { type: Number, min: 1, max: 18, default: 6 },
        avatar: { type: String },
        state: { type: String },
        city: { type: String },
        // Onboarding data
        targetYear: { type: String },
        boardPercentage: { type: String },
        mockScore: { type: String },
        weakSubjects: [String],
        studyStyle: [String]
    },

    // Onboarding status
    onboarding: {
        completed: { type: Boolean, default: false },
        currentStep: { type: Number, default: 1 },
        completedAt: { type: Date }
    },

    // Subscription & Payment
    subscription: {
        plan: {
            type: String,
            enum: ['free', 'pro', 'ultimate'],
            default: 'free'
        },
        status: {
            type: String,
            enum: ['active', 'expired', 'cancelled'],
            default: 'active'
        },
        startDate: { type: Date },
        endDate: { type: Date },
        stripeCustomerId: { type: String },
        stripeSubscriptionId: { type: String },
        currentPeriodStart: { type: Date },
        currentPeriodEnd: { type: Date },
        lastPaymentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SubscriptionPayment'
        }
    },

    // Gamification
    gamification: {
        coins: { type: Number, default: 0 },
        totalXP: { type: Number, default: 0 },
        level: { type: Number, default: 1 },
        currentStreak: { type: Number, default: 0 },
        longestStreak: { type: Number, default: 0 },
        lastStudyDate: { type: Date },
        badges: [{
            badgeId: String,
            earnedAt: { type: Date, default: Date.now }
        }]
    },

    // Progress Tracking (Per Chapter)
    progress: [{
        chapterId: { type: String, required: true },
        subject: { type: String, enum: ['physics', 'chemistry', 'biology', 'mathematics'] },

        // Mastery level (0-100)
        mastery: { type: Number, default: 0, min: 0, max: 100 },

        // Question stats
        totalAttempted: { type: Number, default: 0 },
        correctAnswers: { type: Number, default: 0 },
        accuracy: { type: Number, default: 0 },

        // Time spent (in minutes)
        timeSpent: { type: Number, default: 0 },

        // Weakness indicators
        isWeak: { type: Boolean, default: false },
        weaknessScore: { type: Number, default: 0 }, // 0-100, higher = weaker

        // Last revision
        lastRevisedAt: { type: Date },
        nextRevisionAt: { type: Date },
        revisionCount: { type: Number, default: 0 },

        // Spaced repetition intervals (in days)
        spacedRepetitionInterval: { type: Number, default: 1 }
    }],

    // Neuronz Spaced Repetition (L1-L7)
    neuronzProgress: [{
        questionId: { type: String, required: true },
        level: { type: Number, default: 1, min: 1, max: 7 },
        nextRevisionDate: { type: Date, default: Date.now },
        lastAttempted: { type: Date, default: Date.now },
        isDue: { type: Boolean, default: true }
    }],

    // Recent Study Sessions cache
    recentSessions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StudySession'
    }],

    // Study Plan
    currentStudyPlan: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StudyPlan'
    },

    // Analytics
    analytics: {
        totalStudyTime: { type: Number, default: 0 }, // in minutes
        totalMocksAttempted: { type: Number, default: 0 },
        totalQuestionsAttempted: { type: Number, default: 0 },
        totalQuestionsCorrect: { type: Number, default: 0 },
        overallAccuracy: { type: Number, default: 0 },
        predictedScore: { type: Number, default: 0 },
        weeklyGoalHours: { type: Number, default: 42 }, // 6 hours/day
        weeklyCompletedHours: { type: Number, default: 0 }
    },

    // Settings
    settings: {
        notifications: {
            email: { type: Boolean, default: true },
            push: { type: Boolean, default: true },
            studyReminders: { type: Boolean, default: true },
            weeklyReports: { type: Boolean, default: true }
        },
        privacy: {
            showProfile: { type: Boolean, default: false },
            showProgress: { type: Boolean, default: false }
        },
        theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'auto' }
    },

    // Security
    resetPasswordToken: String,
    resetPasswordExpire: Date,

    // Account status
    isActive: {
        type: Boolean,
        default: true
    },

    isEmailVerified: {
        type: Boolean,
        default: false
    },

    isPhoneVerified: {
        type: Boolean,
        default: false
    },

    referralCode: {
        type: String,
        unique: true,
        sparse: true,
        uppercase: true
    },

    referredByCode: {
        type: String,
        default: null,
        uppercase: true
    },

    emailVerificationToken: String,

    lastLoginAt: Date

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
UserSchema.index({ email: 1 });
UserSchema.index({ 'exams.examType': 1 });
UserSchema.index({ 'subscription.plan': 1 });
UserSchema.index({ 'gamification.totalXP': -1 });
UserSchema.index({ 'progress.chapterId': 1 });
UserSchema.index({ referralCode: 1 }, { unique: true, sparse: true });

// Hash password before saving
UserSchema.pre('save', async function (next) {
    if (this.isNew && !this.referralCode) {
        this.referralCode = `NF${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    }

    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
});

// Method to compare passwords
UserSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Generate JWT Token
UserSchema.methods.getSignedJwtToken = function () {
    return jwt.sign(
        { id: this._id, email: this.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE }
    );
};

// Update streak logic
UserSchema.methods.updateStreak = function () {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastStudy = this.gamification.lastStudyDate ?
        new Date(this.gamification.lastStudyDate) : null;

    if (lastStudy) {
        lastStudy.setHours(0, 0, 0, 0);
        const diffDays = Math.round((today - lastStudy) / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
            // Consecutive day
            this.gamification.currentStreak += 1;
            this.gamification.longestStreak = Math.max(
                this.gamification.longestStreak,
                this.gamification.currentStreak
            );
        } else if (diffDays > 1) {
            // Streak broken
            this.gamification.currentStreak = 1;
        }
        // If diffDays === 0, same day - no change
    } else {
        // First time studying
        this.gamification.currentStreak = 1;
        this.gamification.longestStreak = 1;
    }

    this.gamification.lastStudyDate = new Date();
};

// Get top 3 weaknesses
UserSchema.methods.getTopWeaknesses = function (limit = 3) {
    return this.progress
        .filter(p => p.isWeak)
        .sort((a, b) => b.weaknessScore - a.weaknessScore)
        .slice(0, limit);
};

// Calculate overall accuracy
UserSchema.methods.calculateOverallAccuracy = function () {
    if (this.analytics.totalQuestionsAttempted === 0) return 0;
    return Math.round(
        (this.analytics.totalQuestionsCorrect / this.analytics.totalQuestionsAttempted) * 100
    );
};

module.exports = mongoose.model('User', UserSchema);
