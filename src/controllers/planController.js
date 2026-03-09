const StudyPlan = require('../models/StudyPlan');
const ErrorResponse = require('../utils/errorResponse');
const aiAnalysisService = require('../services/aiAnalysisService');

// @desc    Get user study plan
// @route   GET /api/v1/study-plan
// @access  Private
exports.getStudyPlan = async (req, res, next) => {
    try {
        const plan = await StudyPlan.findOne({ userId: req.user.id, isActive: true });

        if (!plan) {
            return res.status(200).json({
                success: true,
                data: null,
                message: 'No active study plan found. Generate one to get started!'
            });
        }

        if (plan && plan.dailyTasks) {
            plan.dailyTasks.sort((a, b) => new Date(a.date) - new Date(b.date));
        }

        res.status(200).json({
            success: true,
            data: plan
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Generate AI study plan
// @route   POST /api/v1/study-plan/generate
// @access  Private
exports.generatePlan = async (req, res, next) => {
    try {
        const { targetDate } = req.body;

        // Check if targetDate is provided
        if (!targetDate) {
            return next(new ErrorResponse('Please provide a target exam date', 400));
        }

        // Get user weaknesses to prioritize
        const focusAreas = req.user.progress
            .filter(p => p.isWeak)
            .map(p => p.chapterId);

        // Generate plan using AI
        const aiPlan = await aiAnalysisService.generateStudyPlan(req.user, targetDate, focusAreas);

        // Create or update StudyPlan in DB
        let plan = await StudyPlan.findOne({ userId: req.user.id, isActive: true });

        const planData = {
            userId: req.user.id,
            title: `NEET Sprint - ${new Date().toLocaleDateString()}`,
            examType: req.user.primaryExam || 'NEET_UG',
            targetDate: new Date(targetDate),
            startDate: new Date(),
            endDate: new Date(targetDate),
            dailySchedule: {
                studyHoursPerDay: req.user.profile.studyHoursPerDay || 6
            },
            progress: {
                totalChapters: 97, // Approximate total NEET chapters
                completedChapters: 0,
                totalHours: 500,
                completedHours: 0
            },
            dailyTasks: aiPlan.dailyTasks || [],
            recommendations: aiPlan.recommendations || []
        };

        if (plan) {
            plan = await StudyPlan.findByIdAndUpdate(plan._id, planData, { new: true });
        } else {
            plan = await StudyPlan.create(planData);
        }

        res.status(201).json({
            success: true,
            data: plan
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update task status
// @route   PUT /api/v1/study-plan/task/:taskId
// @access  Private
exports.updateTaskStatus = async (req, res, next) => {
    try {
        const { isCompleted } = req.body;
        const plan = await StudyPlan.findOne({ userId: req.user.id, isActive: true });

        if (!plan) return next(new ErrorResponse('No active study plan found', 404));

        // Logic to find and update task in nested dailyTasks array
        let taskFound = false;
        plan.dailyTasks.forEach(dt => {
            dt.tasks.forEach(task => {
                if (task._id.toString() === req.params.taskId) {
                    task.isCompleted = isCompleted;
                    task.completedAt = isCompleted ? new Date() : null;
                    taskFound = true;
                }
            });
        });

        if (!taskFound) return next(new ErrorResponse('Task not found', 404));

        await plan.save();
        plan.updateProgress();
        await plan.save();

        res.status(200).json({
            success: true,
            data: plan
        });
    } catch (error) {
        next(error);
    }
};
