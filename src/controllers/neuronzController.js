const NeuronzService = require('../services/neuronzService');
const ErrorResponse = require('../utils/errorResponse');
const {
    getPreferredLanguage,
    mapImportedQuestionsForLanguage,
} = require('../utils/languagePreference');

// @desc    Get due questions grouped by level (L1–L7)
// @route   GET /api/neuronz/due
// @access  Private
exports.getDueQuestions = async (req, res, next) => {
    try {
        const data = await NeuronzService.getDueQuestions(req.user.id);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Get question documents for a specific level (for quiz player)
// @route   GET /api/neuronz/level/:level/questions
// @access  Private
exports.getLevelQuestions = async (req, res, next) => {
    try {
        const { level } = req.params;
        const levelNum = parseInt(level, 10);
        if (isNaN(levelNum) || levelNum < 1 || levelNum > 7) {
            return next(new ErrorResponse('Level must be between 1 and 7', 400));
        }
        const rawLimit = req.query.limit;
        const parsedLimit = Number.parseInt(String(rawLimit ?? ''), 10);
        const limitValue = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;
        const data = await NeuronzService.getLevelQuestions(req.user.id, levelNum, limitValue);
        const language = getPreferredLanguage(req);
        data.questions = mapImportedQuestionsForLanguage(data.questions, language);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Submit answer for a NeuronZ review question
// @route   POST /api/neuronz/review
// @access  Private
exports.reviewQuestion = async (req, res, next) => {
    try {
        const { questionId, wasCorrect, timeSpent = 0 } = req.body;
        if (!questionId || typeof wasCorrect !== 'boolean') {
            return next(new ErrorResponse('questionId (string) and wasCorrect (boolean) are required', 400));
        }
        const result = await NeuronzService.processQuestionAnswer(
            req.user.id,
            questionId,
            wasCorrect,
            timeSpent
        );
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Batch submit answers after completing a level quiz
// @route   POST /api/neuronz/review/batch or POST /api/neuronz/review-batch
// @access  Private
const UserQuestion = require('../models/UserQuestion');
const LEVEL_INTERVALS = [0, 24, 72, 120, 168, 240, 360, 720];

exports.reviewBatch = async (req, res, next) => {
    try {
        const reviews = req.body.reviews || req.body.answers;
        const userId = req.user._id || req.user.id;

        if (!Array.isArray(reviews) || reviews.length === 0) {
            return res.status(400).json({ success: false, error: 'reviews array required' });
        }

        const qIds = reviews.map(r => String(r.questionId));
        const existingDocs = await UserQuestion.find({ userId, questionId: { $in: qIds } }).lean();
        const docMap = new Map(existingDocs.map(d => [d.questionId, d]));

        const now = new Date();
        let correctCount = 0;

        const bulkOps = reviews.map(rev => {
            const wasCorrect = Boolean(rev.wasCorrect);
            if (wasCorrect) correctCount++;
            const timeSpent = Number(rev.timeSpentSeconds ?? rev.timeSpent ?? 0);
            const current = docMap.get(String(rev.questionId));
            const currentLevel = current?.level || 1;
            const currentStreak = current?.streak || 0;
            const currentLapses = current?.lapses || 0;

            let newLevel;
            let newStreak;
            let newLapses;
            let nextRevision;
            let isMastered = false;

            if (wasCorrect) {
                newLevel = Math.min(7, currentLevel + 1);
                newStreak = currentStreak + 1;
                newLapses = currentLapses;
                const hours = LEVEL_INTERVALS[newLevel] || 24;
                nextRevision = new Date(now.getTime() + hours * 3600000);
                isMastered = (newLevel === 7);
            } else {
                newLevel = Math.max(1, currentLevel - 2);
                newStreak = 0;
                newLapses = currentLapses + 1;
                nextRevision = new Date(now.getTime() + 4 * 3600000);
            }

            return {
                updateOne: {
                    filter: { userId, questionId: String(rev.questionId) },
                    update: {
                        $set: {
                            level: newLevel,
                            streak: newStreak,
                            lapses: newLapses,
                            nextRevision,
                            lastReviewed: now,
                            isMastered
                        },
                        $inc: {
                            totalAttempts: 1,
                            correctAttempts: wasCorrect ? 1 : 0
                        },
                        $push: {
                            userHistory: {
                                $each: [{
                                    date: now,
                                    correct: wasCorrect,
                                    levelAfter: newLevel,
                                    timeSpent: timeSpent
                                }],
                                $slice: -7
                            }
                        }
                    },
                    upsert: true
                }
            };
        });

        await UserQuestion.bulkWrite(bulkOps, { ordered: false });
        await NeuronzService.updateUserDailyProgress(userId, correctCount, reviews.length);

        return res.status(200).json({ success: true, processedCount: reviews.length, data: { processedCount: reviews.length } });
    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Get structured stats for 7-level pyramid dashboard
// @route   GET /api/neuronz/dashboard
// @access  Private
exports.getDashboard = async (req, res, next) => {
    try {
        const data = await NeuronzService.getDashboardStats(req.user.id || req.user._id);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Assemble Daily 20 Blitz session
// @route   GET /api/neuronz/blitz
// @access  Private
exports.getDailyBlitz = async (req, res, next) => {
    try {
        const data = await NeuronzService.assembleDaily20Blitz(req.user.id || req.user._id);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Get user NeuronZ statistics
// @route   GET /api/neuronz/stats
// @access  Private
exports.getUserStats = async (req, res, next) => {
    try {
        const stats = await NeuronzService.getUserStats(req.user.id);
        res.status(200).json({ success: true, data: stats });
    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Get mastery progress for dashboard
// @route   GET /api/neuronz/mastery
// @access  Private
exports.getMasteryProgress = async (req, res, next) => {
    try {
        const progress = await NeuronzService.getMasteryProgress(req.user.id);
        res.status(200).json({ success: true, data: progress });
    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};

// @desc    Get topic tracked summary
// @route   GET /api/neuronz/topics/summary
// @access  Private
exports.getTopicSummary = async (req, res, next) => {
    try {
        const summary = await NeuronzService.getTopicSummary(req.user.id);
        res.status(200).json({ success: true, data: summary });
    } catch (error) {
        next(new ErrorResponse(error.message, 500));
    }
};
