const FormulaSubject = require('../models/FormulaSubject');
const FormulaTopic = require('../models/FormulaTopic');
const FormulaCard = require('../models/FormulaCard');
const FormulaProgress = require('../models/FormulaProgress');
const ErrorResponse = require('../utils/errorResponse');

exports.getFormulaSubjects = async (req, res, next) => {
    try {
        const subjects = await FormulaSubject.find().sort({ position: 1 });
        res.status(200).json({
            success: true,
            data: subjects
        });
    } catch (error) {
        next(error);
    }
};

exports.getFormulaTopics = async (req, res, next) => {
    try {
        const { getMarksChapterId } = req.params;

        // Find the chapter title first via the subject array if needed, or query topics directly
        // The scraping script saved topics with chapterTitle and getMarksTopicId.
        // It didn't save getMarksChapterId on the topic, but it saved chapterTitle. 
        // Let's rely on finding the chapterTitle from the FormulaSubject or passing chapterTitle in the URL.

        // In this case, let's just query topics by chapterTitle
        const { chapterTitle } = req.query;

        let query = {};
        if (chapterTitle) {
            query.chapterTitle = chapterTitle;
        }

        const topics = await FormulaTopic.find(query).sort({ position: 1 });

        res.status(200).json({
            success: true,
            count: topics.length,
            data: topics
        });
    } catch (error) {
        next(error);
    }
};

exports.getFormulaCards = async (req, res, next) => {
    try {
        const { topicTitle } = req.params;

        const cards = await FormulaCard.find({ topicTitle }).sort({ position: 1 });

        res.status(200).json({
            success: true,
            count: cards.length,
            data: cards
        });
    } catch (error) {
        next(error);
    }
};

// Update progress for a specific card
exports.updateCardProgress = async (req, res, next) => {
    try {
        const { cardId } = req.params;
        const { status, isBookmarked, chapterTitle, topicTitle } = req.body;

        // Upsert progress
        const progress = await FormulaProgress.findOneAndUpdate(
            { userId: req.user.id, cardId },
            {
                userId: req.user.id,
                cardId,
                ...(status !== undefined && { status }),
                ...(isBookmarked !== undefined && { isBookmarked }),
                ...(chapterTitle && { chapterTitle }),
                ...(topicTitle && { topicTitle }),
                lastSeenAt: Date.now()
            },
            { new: true, upsert: true }
        );

        res.status(200).json({
            success: true,
            data: progress
        });
    } catch (error) {
        next(error);
    }
};

// Get progress for a topic
exports.getTopicProgress = async (req, res, next) => {
    try {
        const { topicTitle } = req.params;
        const progress = await FormulaProgress.find({ userId: req.user.id, topicTitle });
        res.status(200).json({
            success: true,
            data: progress
        });
    } catch (error) {
        next(error);
    }
};

// Get progress summary for a chapter
exports.getChapterProgressSummary = async (req, res, next) => {
    try {
        const { chapterTitle } = req.params;
        const progress = await FormulaProgress.find({ userId: req.user.id, chapterTitle });
        res.status(200).json({
            success: true,
            data: progress // Return the array of progress documents, frontend will aggregate
        });
    } catch (error) {
        next(error);
    }
};
