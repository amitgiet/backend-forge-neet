const User = require('../models/User');
const Token = require('../models/Token');
const StudySession = require('../models/StudySession');
const TestAttempt = require('../models/TestAttempt');
const QuizMeta = require('../models/QuizMeta');
const ImportedCurriculumQuizRun = require('../models/ImportedCurriculumQuizRun');
const Challenge = require('../models/Challenge');
const ErrorResponse = require('../utils/errorResponse');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { ensureReferralForUser } = require('../services/referral.service');

const crypto = require('crypto');

// Helper to generate numeric OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const formatMinutes = (minutes) => {
    if (!minutes || minutes <= 0) return '0m';

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours === 0) return `${remainingMinutes}m`;
    if (remainingMinutes === 0) return `${hours}h`;
    return `${hours}h ${remainingMinutes}m`;
};

const formatLocalDate = (dateValue) => {
    const d = new Date(dateValue);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = async (req, res, next) => {
    try {
        const {
            name,
            email,
            password,
            phone,
            primaryExam,
            targetYear,
            class: userClass,
            preferredLanguage,
            fcmToken,
            timezone,
            userAgent
        } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'User already exists with this email'
            });
        }

        // OTP flow is temporarily disabled: allow optional phone at signup.
        const isPhoneVerified = false;

        // Create user
        const user = await User.create({
            name,
            email,
            password,
            phone,
            isPhoneVerified,
            primaryExam: primaryExam || 'NEET_UG',
            exams: [{
                examType: primaryExam || 'NEET_UG',
                targetYear: targetYear || new Date().getFullYear() + 1,
                isActive: true
            }],
            profile: {
                class: userClass || 12,
                preferredLanguage: preferredLanguage || 'en'
            }
        });

        if (fcmToken) {
            await Token.findOneAndUpdate(
                { fcmToken },
                { user: user._id, fcmToken, timezone: timezone || 'UTC', userAgent: userAgent || 'mobile_app' },
                { upsert: true, new: true }
            );
        }

        sendTokenResponse(user, 201, res);

    } catch (error) {
        next(error);
    }
};

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = async (req, res, next) => {
    try {
        const { email, password, fcmToken, timezone, userAgent } = req.body;

        // Validate email & password
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Please provide an email and password'
            });
        }

        // Check for user (include password field)
        const user = await User.findOne({ email }).select('+password');

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Check if password matches
        const isMatch = await user.matchPassword(password);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Update last login and streak
        user.lastLoginAt = new Date();
        user.updateStreak();
        await user.save({ validateBeforeSave: false });

        if (fcmToken) {
            await Token.findOneAndUpdate(
                { fcmToken },
                { user: user._id, fcmToken, timezone: timezone || 'UTC', userAgent: userAgent || 'mobile_app' },
                { upsert: true, new: true }
            );
        }

        sendTokenResponse(user, 200, res);

    } catch (error) {
        next(error);
    }
};

// @desc    Get current logged in user
// @route   GET /api/v1/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Backfill referral code for legacy users who signed up before referral rollout.
        if (!user.referralCode) {
            await ensureReferralForUser(user);
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update user profile
// @route   PUT /api/v1/auth/profile
// @access  Private
exports.updateProfile = async (req, res, next) => {
    try {
        const fieldsToUpdate = {
            name: req.body.name,
            phone: req.body.phone,
            'profile.class': req.body.class,
            'profile.coachingInstitute': req.body.coachingInstitute,
            'profile.preferredLanguage': req.body.preferredLanguage,
            'profile.studyHoursPerDay': req.body.studyHoursPerDay,
            'profile.state': req.body.state,
            'profile.city': req.body.city,
            'profile.targetYear': req.body.profile?.targetYear,
            'profile.boardPercentage': req.body.profile?.boardPercentage,
            'profile.mockScore': req.body.profile?.mockScore,
            'profile.weakSubjects': req.body.profile?.weakSubjects,
            'profile.studyStyle': req.body.profile?.studyStyle
        };

        // Remove undefined fields
        Object.keys(fieldsToUpdate).forEach(key =>
            fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]
        );

        const user = await User.findByIdAndUpdate(
            req.user.id,
            fieldsToUpdate,
            {
                new: true,
                runValidators: true
            }
        );

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update onboarding progress
// @route   PUT /api/v1/auth/onboarding
// @access  Private
exports.updateOnboarding = async (req, res, next) => {
    try {
        const { step, completed, data } = req.body;

        const updateFields = {
            'onboarding.currentStep': step
        };

        if (completed) {
            updateFields['onboarding.completed'] = true;
            updateFields['onboarding.completedAt'] = new Date();
        }

        if (data) {
            Object.keys(data).forEach(key => {
                updateFields[`profile.${key}`] = data[key];
            });
        }

        const user = await User.findByIdAndUpdate(
            req.user.id,
            updateFields,
            { new: true, runValidators: true }
        );

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update password
// @route   PUT /api/v1/auth/password
// @access  Private
exports.updatePassword = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select('+password');

        // Check current password
        if (!(await user.matchPassword(req.body.currentPassword))) {
            return res.status(401).json({
                success: false,
                error: 'Password is incorrect'
            });
        }

        user.password = req.body.newPassword;
        await user.save();

        sendTokenResponse(user, 200, res);

    } catch (error) {
        next(error);
    }
};

// @desc    Logout user / clear cookie
// @route   GET /api/v1/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
    res.cookie('token', 'none', {
        expires: new Date(Date.now() + 10 * 1000),
        httpOnly: true
    });

    res.status(200).json({
        success: true,
        data: {}
    });
};

// @desc    Add exam to user profile
// @route   POST /api/v1/auth/exams
// @access  Private
exports.addExam = async (req, res, next) => {
    try {
        const { examType, targetYear, targetScore } = req.body;

        const user = await User.findById(req.user.id);

        // Check if exam already exists
        const examExists = user.exams.find(e => e.examType === examType && e.isActive);
        if (examExists) {
            return res.status(400).json({
                success: false,
                error: 'Exam already added to your profile'
            });
        }

        user.exams.push({
            examType,
            targetYear,
            targetScore,
            isActive: true
        });

        await user.save();

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get user dashboard stats
// @route   GET /api/v1/auth/dashboard
// @access  Private
exports.getDashboard = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        const StudyPlan = require('../models/StudyPlan');

        // Get recent test attempts
        const recentTests = await TestAttempt.find({
            userId: req.user.id,
            status: 'COMPLETED'
        })
            .sort({ submittedAt: -1 })
            .limit(5);

        // Get active study plan
        const activePlan = await StudyPlan.findOne({
            userId: req.user.id,
            status: 'ACTIVE'
        });

        // Calculate today's progress
        const todaysTasks = activePlan ? activePlan.getTodaysTasks() : null;

        // Get top 3 weaknesses
        const topWeaknesses = user.getTopWeaknesses(3);

        // Dashboard data
        const dashboard = {
            user: {
                name: user.name,
                level: user.gamification.level,
                totalXP: user.gamification.totalXP,
                coins: user.gamification.coins,
                currentStreak: user.gamification.currentStreak,
                longestStreak: user.gamification.longestStreak,
                subscription: user.subscription.plan
            },

            analytics: {
                predictedScore: user.analytics.predictedScore,
                overallAccuracy: user.analytics.overallAccuracy,
                totalStudyTime: user.analytics.totalStudyTime,
                totalMocksAttempted: user.analytics.totalMocksAttempted,
                weeklyProgress: {
                    goal: user.analytics.weeklyGoalHours,
                    completed: user.analytics.weeklyCompletedHours,
                    percentage: Math.round((user.analytics.weeklyCompletedHours / user.analytics.weeklyGoalHours) * 100)
                }
            },

            weaknesses: topWeaknesses,

            recentTests: recentTests.map(test => ({
                testId: test.testId,
                score: test.score.marksObtained,
                totalMarks: test.score.totalMarks,
                percentage: test.score.percentage,
                submittedAt: test.submittedAt
            })),

            todaysPlan: todaysTasks ? {
                totalTasks: todaysTasks.tasks.length,
                completedTasks: todaysTasks.tasks.filter(t => t.isCompleted).length,
                studyHours: todaysTasks.dailyGoal.studyHours,
                completedHours: todaysTasks.dailyGoal.completedHours
            } : null,

            studyPlan: activePlan ? {
                id: activePlan._id,
                title: activePlan.title,
                progress: activePlan.progress.overallProgress,
                isOnTrack: activePlan.isOnTrack()
            } : null
        };

        res.status(200).json({
            success: true,
            data: dashboard
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Get today's progress stats for dashboard card
// @route   GET /api/v1/auth/today-progress
// @access  Private
exports.getTodayProgress = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.user._id)) {
            return res.status(200).json({
                success: true,
                data: {
                    date: formatLocalDate(new Date()),
                    studyTimeMinutes: 0,
                    questionsAttempted: 0,
                    correctAnswers: 0,
                    accuracy: 0,
                    formattedStudyTime: '0m',
                    chaptersCovered: 0,
                    subjectBreakdown: { biology: 0, chemistry: 0, physics: 0 },
                    resourcesViewedToday: 0,
                    topperStudyMinutes: 0,
                }
            });
        }

        const userId = new mongoose.Types.ObjectId(req.user._id);
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        // Try to load resource log model (will exist after Phase 2)
        let ToppersResourceLog;
        try { ToppersResourceLog = require('../models/ToppersResourceLog'); } catch (_) { }

        const [sessionAgg, testAgg, generatedQuizAgg, curriculumAgg, curriculumSubjectAgg, resourceAgg] = await Promise.all([
            StudySession.aggregate([
                {
                    $match: {
                        userId,
                        status: 'COMPLETED',
                        startTime: { $gte: startOfDay, $lte: endOfDay }
                    }
                },
                {
                    $group: {
                        _id: null,
                        studyTimeMinutes: { $sum: { $ifNull: ['$duration', 0] } },
                        questionsAttempted: { $sum: { $ifNull: ['$questionsSolved', 0] } }
                    }
                }
            ]),
            TestAttempt.aggregate([
                {
                    $match: {
                        userId,
                        status: 'submitted',
                        submittedAt: { $gte: startOfDay, $lte: endOfDay }
                    }
                },
                {
                    $group: {
                        _id: null,
                        questionsAttempted: { $sum: { $ifNull: ['$results.attempted', 0] } },
                        correctAnswers: { $sum: { $ifNull: ['$results.correct', 0] } },
                        studyTimeSeconds: { $sum: { $ifNull: ['$results.timeAnalysis.totalTime', 0] } }
                    }
                }
            ]),
            QuizMeta.aggregate([
                { $match: { ownerUserId: userId } },
                { $unwind: '$attempts' },
                {
                    $match: {
                        'attempts.userId': userId,
                        'attempts.attemptDate': { $gte: startOfDay, $lte: endOfDay }
                    }
                },
                {
                    $group: {
                        _id: null,
                        questionsAttempted: { $sum: { $ifNull: ['$attempts.totalQuestions', 0] } },
                        correctAnswers: { $sum: { $ifNull: ['$attempts.score', 0] } },
                        studyTimeSeconds: { $sum: { $ifNull: ['$attempts.timeTaken', 0] } }
                    }
                }
            ]),
            // Curriculum browser quiz runs – totals
            ImportedCurriculumQuizRun.aggregate([
                {
                    $match: {
                        userId,
                        status: 'submitted',
                        submittedAt: { $gte: startOfDay, $lte: endOfDay }
                    }
                },
                {
                    $group: {
                        _id: null,
                        questionsAttempted: { $sum: { $ifNull: ['$totalQuestions', 0] } },
                        correctAnswers: { $sum: { $ifNull: ['$correctAnswers', 0] } },
                        elapsedSeconds: { $sum: { $ifNull: ['$elapsedSeconds', 0] } },
                        chaptersCovered: { $addToSet: '$chapterId' }
                    }
                }
            ]),
            // Curriculum browser quiz runs – per subject breakdown
            ImportedCurriculumQuizRun.aggregate([
                {
                    $match: {
                        userId,
                        status: 'submitted',
                        submittedAt: { $gte: startOfDay, $lte: endOfDay }
                    }
                },
                {
                    $group: {
                        _id: '$subject',
                        questionsAttempted: { $sum: { $ifNull: ['$totalQuestions', 0] } }
                    }
                }
            ]),
            // Toppers resource log (optional – only if model exists)
            ToppersResourceLog
                ? ToppersResourceLog.aggregate([
                    {
                        $match: {
                            userId,
                            viewedAt: { $gte: startOfDay, $lte: endOfDay }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            count: { $sum: 1 },
                            totalSeconds: { $sum: { $ifNull: ['$durationSeconds', 0] } }
                        }
                    }
                ])
                : Promise.resolve([]),
        ]);

        const sessionData = sessionAgg[0] || { studyTimeMinutes: 0, questionsAttempted: 0 };
        const testData = testAgg[0] || { questionsAttempted: 0, correctAnswers: 0, studyTimeSeconds: 0 };
        const generatedData = generatedQuizAgg[0] || { questionsAttempted: 0, correctAnswers: 0, studyTimeSeconds: 0 };
        const currData = curriculumAgg[0] || { questionsAttempted: 0, correctAnswers: 0, elapsedSeconds: 0, chaptersCovered: [] };
        const resourceData = resourceAgg[0] || { count: 0, totalSeconds: 0 };

        // Subject breakdown from curriculum runs
        const subjectBreakdown = { biology: 0, chemistry: 0, physics: 0 };
        curriculumSubjectAgg.forEach(s => {
            if (s._id && subjectBreakdown[s._id] !== undefined) {
                subjectBreakdown[s._id] = s.questionsAttempted;
            }
        });

        const studyTimeMinutes = Math.max(
            0,
            Math.round(
                Number(sessionData.studyTimeMinutes || 0) +
                Number(testData.studyTimeSeconds || 0) / 60 +
                Number(generatedData.studyTimeSeconds || 0) / 60 +
                Number(currData.elapsedSeconds || 0) / 60
            )
        );

        const questionsAttempted = Math.max(
            0,
            Number(sessionData.questionsAttempted || 0) +
            Number(testData.questionsAttempted || 0) +
            Number(generatedData.questionsAttempted || 0) +
            Number(currData.questionsAttempted || 0)
        );

        const correctAnswers = Math.max(
            0,
            Number(testData.correctAnswers || 0) +
            Number(generatedData.correctAnswers || 0) +
            Number(currData.correctAnswers || 0)
        );

        const accuracyBase =
            Number(testData.questionsAttempted || 0) +
            Number(generatedData.questionsAttempted || 0) +
            Number(currData.questionsAttempted || 0);
        const accuracy = accuracyBase > 0 ? Math.round((correctAnswers / accuracyBase) * 100) : 0;

        const topperStudyMinutes = Math.round(Number(resourceData.totalSeconds || 0) / 60);

        res.status(200).json({
            success: true,
            data: {
                date: formatLocalDate(startOfDay),
                studyTimeMinutes,
                questionsAttempted,
                correctAnswers,
                accuracy,
                formattedStudyTime: formatMinutes(studyTimeMinutes),
                chaptersCovered: (currData.chaptersCovered || []).length,
                subjectBreakdown,
                resourcesViewedToday: resourceData.count || 0,
                topperStudyMinutes,
            }
        });
    } catch (error) {
        next(error);
    }
};


// @desc    Get today's quest progress for dashboard card
// @route   GET /api/v1/auth/today-quest
// @access  Private
exports.getTodayQuest = async (req, res, next) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const challenge = await Challenge.findOne({
            userId: req.user.id,
            isActive: true,
            status: 'active',
            startDate: { $lte: endOfDay },
            endDate: { $gte: startOfDay }
        }).sort({ createdAt: -1 });

        if (!challenge) {
            return res.status(200).json({
                success: true,
                data: {
                    hasQuest: false,
                    title: "Today's Quest",
                    xpReward: 0,
                    completedQuizzes: 0,
                    targetQuizzes: 0,
                    progressPercentage: 0,
                    stats: {
                        minutesStudied: 0,
                        questions: 0,
                        accuracy: 0
                    }
                }
            });
        }

        const scheduleByDate = challenge.dailySchedule.find((schedule) => {
            const d = new Date(schedule.date);
            d.setHours(0, 0, 0, 0);
            return d.getTime() === startOfDay.getTime() && schedule.isUnlocked;
        });

        const todaySchedule = scheduleByDate || challenge.dailySchedule.find(s => s.isUnlocked && !s.isCompleted);
        const quizzes = todaySchedule?.quizzes || [];
        const completedQuizzes = quizzes.filter(q => q.isCompleted);

        const targetQuizzes = Number(todaySchedule?.targetQuizzes || quizzes.length || 0);
        const completedCount = completedQuizzes.length;
        const progressPercentage = targetQuizzes > 0
            ? Math.round((completedCount / targetQuizzes) * 100)
            : 0;

        const minutesStudied = Math.round(
            completedQuizzes.reduce((sum, q) => sum + (Number(q.timeSpent || 0) / 60), 0)
        );

        const questions = completedQuizzes.reduce((sum, q) => {
            if (Array.isArray(q.questions) && q.questions.length > 0) {
                return sum + q.questions.length;
            }
            return sum + 4;
        }, 0);

        const accuracy = completedCount > 0
            ? Math.round(completedQuizzes.reduce((sum, q) => sum + Number(q.score || 0), 0) / completedCount)
            : 0;

        const xpReward = targetQuizzes * 30;

        res.status(200).json({
            success: true,
            data: {
                hasQuest: true,
                challengeId: challenge._id,
                title: challenge.title || "Today's Quest",
                xpReward,
                completedQuizzes: completedCount,
                targetQuizzes,
                progressPercentage,
                stats: {
                    minutesStudied: Math.max(0, minutesStudied),
                    questions: Math.max(0, questions),
                    accuracy: Math.max(0, accuracy)
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Send OTP for Login
// @route   POST /api/v1/auth/otp/send
// @access  Public
exports.sendOtp = async (req, res, next) => {
    try {
        const { email } = req.body;

        if (!email) {
            return next(new ErrorResponse('Please provide an email address', 400));
        }

        const user = await User.findOne({ email });
        if (!user) {
            return next(new ErrorResponse('User not found with this email', 404));
        }

        // Generate OTP
        const otp = generateOTP();

        // Hash OTP and save to user
        const otpSalt = await bcrypt.genSalt(10);
        user.emailVerificationToken = await bcrypt.hash(otp, otpSalt); // Reusing field for generic OTP
        user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 mins expiry

        await user.save({ validateBeforeSave: false });

        // Mock Send Email/SMS (In prod, use Nodemailer/Twilio)
        console.log(`[NEETForge Auth] OTP for ${email}: ${otp}`.yellow.bold);

        res.status(200).json({
            success: true,
            message: 'OTP sent to email (Check server console for demo)'
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Verify OTP and Login
// @route   POST /api/v1/auth/otp/verify
// @access  Public
exports.verifyOtpLogin = async (req, res, next) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return next(new ErrorResponse('Please provide email and OTP', 400));
        }

        const user = await User.findOne({
            email,
            resetPasswordExpire: { $gt: Date.now() } // Check expiry
        });

        if (!user) {
            return next(new ErrorResponse('Invalid or expired OTP', 400));
        }

        // Check OTP
        const isMatch = await bcrypt.compare(otp, user.emailVerificationToken);

        if (!isMatch) {
            return next(new ErrorResponse('Invalid OTP', 400));
        }

        // Clear OTP fields
        user.emailVerificationToken = undefined;
        user.resetPasswordExpire = undefined;

        // Mark verified if not already
        if (!user.isEmailVerified) user.isEmailVerified = true;

        user.lastLoginAt = new Date(); // Update login time
        user.updateStreak(); // Update streak on login
        await user.save({ validateBeforeSave: false });

        // Login successful
        sendTokenResponse(user, 200, res);

    } catch (error) {
        next(error);
    }
};

// Helper function to get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
    // Create token
    const token = user.getSignedJwtToken();

    const options = {
        expires: new Date(
            Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000
        ),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        sameSite: 'strict'
    };

    res
        .status(statusCode)
        .cookie('token', token, options)
        .json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                subscription: user.subscription.plan,
                primaryExam: user.primaryExam,
                onboardingCompleted: user.onboarding?.completed || false,
                onboardingStep: user.onboarding?.currentStep || 1
            }
        });
};
