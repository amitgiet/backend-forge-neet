const Question = require('../models/Question');
const Topic = require('../models/Topic');
const Chapter = require('../models/Chapter');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Create a new Question
// @route   POST /api/v1/admin/questions
// @access  Private (Admin only)
exports.createQuestion = async (req, res, next) => {
    try {
        const question = await Question.create({
            ...req.body,
            createdBy: req.user.id
        });

        res.status(201).json({
            success: true,
            data: question
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Create a new Topic
// @route   POST /api/v1/admin/topics
// @access  Private (Admin only)
exports.createTopic = async (req, res, next) => {
    try {
        const topic = await Topic.create(req.body);

        res.status(201).json({
            success: true,
            data: topic
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get dashboard stats for Admin
// @route   GET /api/v1/admin/stats
// @access  Private (Admin only)
exports.getAdminStats = async (req, res, next) => {
    try {
        const totalUsers = await require('../models/User').countDocuments();
        const totalQuestions = await Question.countDocuments();
        const totalTopics = await Topic.countDocuments();

        res.status(200).json({
            success: true,
            data: {
                users: totalUsers,
                questions: totalQuestions,
                topics: totalTopics
            }
        });
    } catch (error) {
        next(error);
    }
};
