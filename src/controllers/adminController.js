const Question = require('../models/Question');
const Topic = require('../models/Topic');
const Chapter = require('../models/Chapter');
const ErrorResponse = require('../utils/errorResponse');

const VALID_RESOURCE_TYPES = ['pdf', 'text', 'html', 'external'];
const VALID_LANGS = ['en', 'hi'];

const isValidHttpUrl = (value) => {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (error) {
        return false;
    }
};

const normalizeContentSourceUpdate = (payload) => {
    if (payload.contentSource && typeof payload.contentSource === 'object') {
        const normalized = {};
        for (const lang of VALID_LANGS) {
            const item = payload.contentSource[lang];
            if (!item) continue;
            if (!item.resourceUrl || !item.resourceType) {
                throw new Error(`contentSource.${lang} requires resourceUrl and resourceType`);
            }
            if (!VALID_RESOURCE_TYPES.includes(item.resourceType)) {
                throw new Error(`Invalid resourceType for ${lang}`);
            }
            if (!isValidHttpUrl(item.resourceUrl)) {
                throw new Error(`Invalid resourceUrl for ${lang}`);
            }
            normalized[lang] = {
                resourceType: item.resourceType,
                resourceUrl: item.resourceUrl
            };
        }
        if (Object.keys(normalized).length === 0) {
            throw new Error('contentSource must include at least one language block');
        }
        return normalized;
    }

    const { language, resourceUrl, resourceType } = payload;
    if (!language || !resourceUrl || !resourceType) {
        throw new Error('language, resourceUrl and resourceType are required');
    }
    if (!VALID_LANGS.includes(language)) {
        throw new Error('language must be en or hi');
    }
    if (!VALID_RESOURCE_TYPES.includes(resourceType)) {
        throw new Error('Invalid resourceType');
    }
    if (!isValidHttpUrl(resourceUrl)) {
        throw new Error('Invalid resourceUrl');
    }
    return {
        [language]: {
            resourceType,
            resourceUrl
        }
    };
};

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

// @desc    Update chapter content source URL/type
// @route   PATCH /api/v1/admin/chapters/:chapterId/content
// @access  Private (Admin only)
exports.updateChapterContentSource = async (req, res, next) => {
    try {
        const { chapterId } = req.params;
        let updatePatch;
        try {
            updatePatch = normalizeContentSourceUpdate(req.body);
        } catch (error) {
            return next(new ErrorResponse(error.message, 400));
        }

        const $set = {};
        Object.keys(updatePatch).forEach((lang) => {
            $set[`contentSource.${lang}.resourceType`] = updatePatch[lang].resourceType;
            $set[`contentSource.${lang}.resourceUrl`] = updatePatch[lang].resourceUrl;
        });

        const chapter = await Chapter.findOneAndUpdate(
            { chapterId: String(chapterId).toLowerCase() },
            { $set },
            { new: true }
        );

        if (!chapter) {
            return next(new ErrorResponse('Chapter not found', 404));
        }

        res.status(200).json({
            success: true,
            data: chapter
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update topic content source URL/type
// @route   PATCH /api/v1/admin/topics/:topicId/content
// @access  Private (Admin only)
exports.updateTopicContentSource = async (req, res, next) => {
    try {
        const { topicId } = req.params;
        let updatePatch;
        try {
            updatePatch = normalizeContentSourceUpdate(req.body);
        } catch (error) {
            return next(new ErrorResponse(error.message, 400));
        }

        const $set = {};
        Object.keys(updatePatch).forEach((lang) => {
            $set[`contentSource.${lang}.resourceType`] = updatePatch[lang].resourceType;
            $set[`contentSource.${lang}.resourceUrl`] = updatePatch[lang].resourceUrl;
        });

        const topic = await Topic.findOneAndUpdate(
            { topicId: String(topicId).toLowerCase() },
            { $set },
            { new: true }
        );

        if (!topic) {
            return next(new ErrorResponse('Topic not found', 404));
        }

        res.status(200).json({
            success: true,
            data: topic
        });
    } catch (error) {
        next(error);
    }
};
