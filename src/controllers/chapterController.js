const Chapter = require('../models/Chapter');


const ErrorResponse = require('../utils/errorResponse');

// @desc    Get all chapters
// @route   GET /api/v1/chapters
// @access  Public
exports.getChapters = async (req, res, next) => {
    try {
        const { subject, class: ncertClass } = req.query;
        const query = { isActive: true };

        if (subject) query.subject = subject;
        if (ncertClass) query['ncert.class'] = ncertClass;

        const chapters = await Chapter.find(query).sort({ 'ncert.chapterNumber': 1 });

        res.status(200).json({
            success: true,
            count: chapters.length,
            data: chapters
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get single chapter
// @route   GET /api/v1/chapters/:chapterId
// @access  Public
exports.getChapter = async (req, res, next) => {
    try {
        const chapter = await Chapter.findOne({ chapterId: req.params.chapterId });

        if (!chapter) {
            return next(new ErrorResponse(`Chapter not found with id of ${req.params.chapterId}`, 404));
        }

        res.status(200).json({
            success: true,
            data: chapter
        });
    } catch (error) {
        next(error);
    }
};
