const UserQuestion = require('../models/UserQuestion');
const ImportedQuestion = require('../models/ImportedQuestion');
const UserLine = require('../models/UserLine');
const NCERTLine = require('../models/NCERTLine');
const Chapter = require('../models/Chapter');
const User = require('../models/User');
const mongoose = require('mongoose');

/**
 * NeuronZ Spaced Repetition Service (Question-Based)
 *
 * Level intervals (hours):
 *  L1: 24h   L2: 72h (3d)   L3: 120h (5d)   L4: 168h (7d)
 *  L5: 240h (10d)   L6: 360h (15d)   L7: 720h (30d - MASTERED)
 *
 * Entry: user submits a curriculum quiz → answered questions enroll at L1, due after 24h.
 * Correct answer in NeuronZ review → advance 1 level.
 * Wrong answer → stay at same level (no drop).
 */
class NeuronzService {
    static LEVEL_INTERVALS = [0, 24, 72, 120, 168, 240, 360, 720];

    static LEVEL_NAMES = {
        1: 'Temporary Memory',
        2: 'Short Term Memory (Encoding Stage)',
        3: 'Repeating Short Memory (Neurons Formation)',
        4: 'Arriving Long Term (Connecting Neurons)',
        5: 'Retaining Long Term (Hippocampus Processing)',
        6: 'Permanent Stage (Cerebral Cortex Storing)',
        7: 'Mastered 🔒',
    };

    /**
     * Get all questions due today, grouped by level (L1–L7).
     * A question is "due" when nextRevision <= end of today.
     */
    static async getDueQuestions(userId) {
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        const dueUserQuestions = await UserQuestion.find({
            userId: new mongoose.Types.ObjectId(userId),
            nextRevision: { $lte: endOfToday },
            level: { $gte: 1, $lte: 7 },
        }).sort({ level: 1, nextRevision: 1 }).lean();

        // Group by level
        const byLevel = { L1: [], L2: [], L3: [], L4: [], L5: [], L6: [], L7: [] };
        for (const uq of dueUserQuestions) {
            const key = `L${uq.level}`;
            if (byLevel[key]) byLevel[key].push(uq);
        }

        // Count totals at each level (not just due ones) — for dashboard display
        const levelCounts = await UserQuestion.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: '$level', total: { $sum: 1 }, mastered: { $sum: { $cond: ['$isMastered', 1, 0] } } } },
        ]);

        const totalByLevel = {};
        for (const entry of levelCounts) {
            totalByLevel[`L${entry._id}`] = { total: entry.total, mastered: entry.mastered };
        }

        const masteredTotal = await UserQuestion.countDocuments({ userId, isMastered: true });
        const allTotal = await UserQuestion.countDocuments({ userId });

        return {
            total: dueUserQuestions.length,
            byLevel,
            totalByLevel,
            masteredTotal,
            allTotal,
        };
    }

    /**
     * Get full question documents for a specific level (for the quiz player).
     * Returns questions that are due (nextRevision <= now) for this level.
     */
    static async getLevelQuestions(userId, level, limit = 50) {
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        const userQuestions = await UserQuestion.find({
            userId: new mongoose.Types.ObjectId(userId),
            level: Number(level),
            nextRevision: { $lte: endOfToday },
        }).sort({ nextRevision: 1 }).limit(limit).lean();

        if (userQuestions.length === 0) return { questions: [], userQuestions: [] };

        const questionIds = userQuestions.map((uq) => String(uq.questionId));
        const questionDocs = await ImportedQuestion.find({ questionId: { $in: questionIds } }).lean();
        const questionMap = {};
        questionDocs.forEach((q) => { questionMap[String(q.questionId)] = q; });

        // Merge and return in the order of userQuestions
        const questions = userQuestions
            .map((uq) => {
                const q = questionMap[String(uq.questionId)];
                if (!q) return null;
                return {
                    ...q,
                    userQuestionId: String(uq._id),
                    currentLevel: uq.level,
                    streak: uq.streak,
                };
            })
            .filter(Boolean);

        return { questions, userQuestions };
    }

    /**
     * Process a NeuronZ review answer for a single question.
     * wasCorrect = true  → advance level, schedule next revision
     * wasCorrect = false → stay same level, schedule next revision from now
     */
    static async processQuestionAnswer(userId, questionId, wasCorrect, timeSpent = 0) {
        let userQuestion = await UserQuestion.findOne({
            userId: new mongoose.Types.ObjectId(userId),
            questionId: String(questionId),
        });

        if (!userQuestion) {
            throw new Error(`Question ${questionId} not enrolled in NeuronZ for this user`);
        }

        const levelBefore = userQuestion.level;
        userQuestion.updateLevel(wasCorrect, timeSpent);
        await userQuestion.save();

        // Update user daily progress
        await this.updateUserDailyProgress(userId, wasCorrect ? 1 : 0, 1);

        return {
            questionId: String(questionId),
            wasCorrect,
            levelBefore,
            levelAfter: userQuestion.level,
            nextRevision: userQuestion.nextRevision,
            streak: userQuestion.streak,
            isMastered: userQuestion.isMastered,
        };
    }

    /**
     * Get user statistics across all NeuronZ levels.
     */
    static async getUserStats(userId) {
        const stats = await UserQuestion.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(userId) } },
            {
                $group: {
                    _id: '$level',
                    count: { $sum: 1 },
                    avgStreak: { $avg: '$streak' },
                    totalCorrect: { $sum: '$correctAttempts' },
                    totalAttempts: { $sum: '$totalAttempts' },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        const masteredCount = await UserQuestion.countDocuments({ userId, isMastered: true });
        const dueCount = await UserQuestion.countDocuments({
            userId,
            nextRevision: { $lte: new Date() },
        });

        return {
            levelDistribution: stats,
            masteredQuestions: masteredCount,
            dueToday: dueCount,
            totalQuestions: await UserQuestion.countDocuments({ userId }),
        };
    }

    /**
     * Get summary of tracked topics (for Dashboard & Revision).
     * Aggregates UserQuestions and UserLines to show due counts and L1-L7 distribution.
     */
    static async getTopicSummary(userId) {
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        // 1. Group UserQuestions by Topic
        const questionSummary = await UserQuestion.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(userId) } },
            {
                $lookup: {
                    from: 'importedquestions',
                    localField: 'questionId',
                    foreignField: 'questionId',
                    as: 'qData'
                }
            },
            { $unwind: '$qData' },
            {
                $group: {
                    _id: '$qData.topic',
                    topicId: { $first: '$qData.topic' },
                    subject: { $first: '$qData.subject' },
                    totalTracked: { $sum: 1 },
                    dueNow: { $sum: { $cond: [{ $lte: ['$nextRevision', endOfToday] }, 1, 0] } },
                    L1: { $sum: { $cond: [{ $eq: ['$level', 1] }, 1, 0] } },
                    L2: { $sum: { $cond: [{ $eq: ['$level', 2] }, 1, 0] } },
                    L3: { $sum: { $cond: [{ $eq: ['$level', 3] }, 1, 0] } },
                    L4: { $sum: { $cond: [{ $eq: ['$level', 4] }, 1, 0] } },
                    L5: { $sum: { $cond: [{ $eq: ['$level', 5] }, 1, 0] } },
                    L6: { $sum: { $cond: [{ $eq: ['$level', 6] }, 1, 0] } },
                    L7: { $sum: { $cond: [{ $eq: ['$level', 7] }, 1, 0] } },
                }
            }
        ]);

        // 2. Group UserLines by Chapter
        const lineSummary = await UserLine.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(userId) } },
            {
                $lookup: {
                    from: 'ncertlines',
                    localField: 'lineId',
                    foreignField: 'lineId',
                    as: 'nData'
                }
            },
            { $unwind: '$nData' },
            {
                $group: {
                    _id: {
                        subject: '$nData.subject',
                        class: '$nData.class',
                        chapter: '$nData.chapter'
                    },
                    totalTracked: { $sum: 1 },
                    dueNow: { $sum: { $cond: [{ $lte: ['$nextRevision', endOfToday] }, 1, 0] } },
                    L1: { $sum: { $cond: [{ $eq: ['$level', 1] }, 1, 0] } },
                    L2: { $sum: { $cond: [{ $eq: ['$level', 2] }, 1, 0] } },
                    L3: { $sum: { $cond: [{ $eq: ['$level', 3] }, 1, 0] } },
                    L4: { $sum: { $cond: [{ $eq: ['$level', 4] }, 1, 0] } },
                    L5: { $sum: { $cond: [{ $eq: ['$level', 5] }, 1, 0] } },
                    L6: { $sum: { $cond: [{ $eq: ['$level', 6] }, 1, 0] } },
                    L7: { $sum: { $cond: [{ $eq: ['$level', 7] }, 1, 0] } },
                }
            }
        ]);

        // Resolve Chapter Names for Lines
        const mergedTopics = [];

        for (const t of questionSummary) {
            mergedTopics.push({
                topicId: String(t.topicId || 'Unknown'),
                topic: String(t.topicId || 'Multiple Topics'),
                subject: String(t.subject || 'mixed').toLowerCase(),
                totalTracked: t.totalTracked,
                dueNow: t.dueNow,
                byLevel: { L1: t.L1, L2: t.L2, L3: t.L3, L4: t.L4, L5: t.L5, L6: t.L6, L7: t.L7 },
                masteryPercent: t.totalTracked > 0 ? Math.round((t.L7 / t.totalTracked) * 100) : 0,
                lastActivityAt: null
            });
        }

        for (const l of lineSummary) {
            const { subject, class: cls, chapter: chNum } = l._id;
            // Fetch real chapter name if possible
            const chapterDoc = await Chapter.findOne({
                subject: String(subject).toLowerCase(),
                'ncert.class': cls,
                'ncert.chapterNumber': chNum
            }).lean();

            const chapterName = chapterDoc?.name?.en || `Ch ${chNum} (${cls})`;

            mergedTopics.push({
                topicId: `NCERT-${subject}-${cls}-${chNum}`,
                topic: `[Lines] ${chapterName}`,
                subject: String(subject || 'mixed').toLowerCase(),
                totalTracked: l.totalTracked,
                dueNow: l.dueNow,
                byLevel: { L1: l.L1, L2: l.L2, L3: l.L3, L4: l.L4, L5: l.L5, L6: l.L6, L7: l.L7 },
                masteryPercent: l.totalTracked > 0 ? Math.round((l.L7 / l.totalTracked) * 100) : 0,
                lastActivityAt: null
            });
        }

        // Sort descending by dueNow
        mergedTopics.sort((a, b) => b.dueNow - a.dueNow || b.totalTracked - a.totalTracked);

        return { topics: mergedTopics };
    }

    /**
     * Get mastery progress summary for dashboard.
     */
    static async getMasteryProgress(userId) {
        const progress = await UserQuestion.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(userId) } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    mastered: { $sum: { $cond: [{ $eq: ['$level', 7] }, 1, 0] } },
                    avgLevel: { $avg: '$level' },
                },
            },
        ]);

        const result = progress[0] || { total: 0, mastered: 0, avgLevel: 1 };
        return {
            totalQuestions: result.total,
            masteredQuestions: result.mastered,
            masteryPercentage: result.total > 0 ? Math.round((result.mastered / result.total) * 100) : 0,
            averageLevel: Math.round(result.avgLevel * 10) / 10,
        };
    }

    /**
     * Update user's overall daily progress stats.
     */
    static async updateUserDailyProgress(userId, correctAnswers, totalQuestions) {
        try {
            const user = await User.findById(userId);
            if (!user) return;
            if (typeof user.updateStreak === 'function') user.updateStreak();
            user.analytics.totalQuestionsAttempted += totalQuestions;
            user.analytics.totalQuestionsCorrect += correctAnswers;
            if (typeof user.calculateOverallAccuracy === 'function') {
                user.analytics.overallAccuracy = user.calculateOverallAccuracy();
            }
            await user.save();
        } catch (err) {
            console.warn('[NeuronzService] updateUserDailyProgress failed:', err.message);
        }
    }
}

module.exports = NeuronzService;
