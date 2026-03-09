const TestSeriesSubject = require('../models/TestSeriesSubject');
const TestSeriesChapter = require('../models/TestSeriesChapter');
const TestSeriesTopic = require('../models/TestSeriesTopic');
const ErrorResponse = require('../utils/errorResponse');

exports.getSubjects = async (req, res, next) => {
    try {
        const subjects = await TestSeriesSubject.find().sort({ name: 1 }).lean();

        res.status(200).json({
            success: true,
            data: subjects
        });
    } catch (error) {
        next(error);
    }
};

exports.getChapters = async (req, res, next) => {
    try {
        const { subjectId } = req.params;
        const chapters = await TestSeriesChapter.find({ subjectId }).sort({ name: 1 }).lean();

        res.status(200).json({
            success: true,
            data: chapters
        });
    } catch (error) {
        next(error);
    }
};

exports.getTopics = async (req, res, next) => {
    try {
        const { chapterId } = req.params;
        const topics = await TestSeriesTopic.find({ chapterId }).sort({ name: 1 }).lean();

        res.status(200).json({
            success: true,
            data: topics
        });
    } catch (error) {
        next(error);
    }
};
