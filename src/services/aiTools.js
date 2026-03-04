const User = require('../models/User');
const TestAttempt = require('../models/TestAttempt');
const SessionAttempt = require('../models/SessionAttempt');
const UserLine = require('../models/UserLine');
const UserQuestion = require('../models/UserQuestion');
const Question = require('../models/Question');
const NCERTLine = require('../models/NCERTLine');
const Chapter = require('../models/Chapter');
const QuizMeta = require('../models/QuizMeta');
const ImportedCurriculum = require('../models/ImportedCurriculum');
const ImportedSubtopicAttempt = require('../models/ImportedSubtopicAttempt');
const ImportedCurriculumQuizRun = require('../models/ImportedCurriculumQuizRun');
const MockTest = require('../models/MockTest');
const MockTestProgress = require('../models/MockTestProgress');
const QuizFactoryService = require('./quizFactoryService');
const GeminiService = require('./geminiService');

class AITools {
    // Performance Analysis Tools
    static async getLastQuiz(userId, limit = 5) {
        // Last quiz should refer to the most recent QuizMeta attempts (AI quizzes),
        // not spaced-revision sessions.
        const pipeline = [
            { $match: { attempts: { $exists: true, $ne: [] } } },
            { $unwind: '$attempts' },
            { $match: { 'attempts.userId': userId } },
            { $sort: { 'attempts.attemptDate': -1 } },
            { $limit: limit },
            {
                $project: {
                    _id: 1,
                    topic: 1,
                    subject: 1,
                    date: '$attempts.attemptDate',
                    score: '$attempts.score',
                    totalQuestions: '$attempts.totalQuestions',
                    percentage: '$attempts.percentage',
                    timeTaken: '$attempts.timeTaken'
                }
            }
        ];

        const rows = await QuizMeta.aggregate(pipeline).exec();

        return rows.map((r) => ({
            quizId: String(r._id),
            date: r.date,
            topic: r.topic || 'Unknown',
            subject: r.subject || 'Unknown',
            accuracy: typeof r.percentage === 'number' ? r.percentage : 0,
            correct: typeof r.score === 'number' ? r.score : 0,
            total: typeof r.totalQuestions === 'number' ? r.totalQuestions : 0,
            timeTaken: typeof r.timeTaken === 'number' ? r.timeTaken : 0
        }));
    }

    static async getLastQuizDetailed(userId) {
        // 1) Find the most recent QuizMeta attempt for this user
        const pipeline = [
            { $match: { attempts: { $exists: true, $ne: [] } } },
            { $unwind: '$attempts' },
            { $match: { 'attempts.userId': userId } },
            { $sort: { 'attempts.attemptDate': -1 } },
            { $limit: 1 },
            {
                $project: {
                    _id: 1,
                    topic: 1,
                    subject: 1,
                    chapterId: 1,
                    date: '$attempts.attemptDate',
                    score: '$attempts.score',
                    totalQuestions: '$attempts.totalQuestions',
                    percentage: '$attempts.percentage',
                    timeTaken: '$attempts.timeTaken',
                    wrongQuestionIndexes: '$attempts.wrongQuestionIndexes'
                }
            }
        ];

        const rows = await QuizMeta.aggregate(pipeline).exec();
        if (!rows || rows.length === 0) {
            return null;
        }

        const row = rows[0];
        const quizId = String(row._id);

        // 2) Load quiz + ordered Question docs
        const quizBundle = await QuizFactoryService.getQuizWithQuestions(quizId);
        if (!quizBundle) {
            return null;
        }

        const { quiz, questions } = quizBundle;
        const wrongIndexes = Array.isArray(row.wrongQuestionIndexes)
            ? row.wrongQuestionIndexes
            : [];

        // 3) Build per-question breakdown
        const byQuestion = [];
        const chapterStats = new Map();
        const difficultyStats = new Map();
        const wrongQuestions = [];

        const getQuestionText = (q) => {
            if (!q) return '';
            if (q.question && typeof q.question === 'object') {
                return q.question.en || q.question.hi || '';
            }
            return q.question || '';
        };

        const chapterFallback = quiz?.chapterId || null;
        const difficultyFallback = quiz?.difficulty || 'mixed';

        questions.forEach((q, index) => {
            const isWrong = wrongIndexes.includes(index);
            const chapterId = q?.chapterId || chapterFallback || 'unknown';
            const difficulty = q?.difficulty || difficultyFallback || 'mixed';
            const questionId = q?.questionId || '';
            const text = getQuestionText(q);

            byQuestion.push({
                index,
                questionId,
                text,
                chapterId,
                difficulty,
                isWrong
            });

            // Chapter aggregation
            if (!chapterStats.has(chapterId)) {
                chapterStats.set(chapterId, { chapterId, correct: 0, total: 0 });
            }
            const chap = chapterStats.get(chapterId);
            chap.total += 1;
            if (!isWrong) chap.correct += 1;

            // Difficulty aggregation
            if (!difficultyStats.has(difficulty)) {
                difficultyStats.set(difficulty, { difficulty, correct: 0, total: 0 });
            }
            const diff = difficultyStats.get(difficulty);
            diff.total += 1;
            if (!isWrong) diff.correct += 1;

            if (isWrong) {
                wrongQuestions.push({
                    index,
                    questionId,
                    text,
                    difficulty,
                    conceptTags: q?.conceptTags || []
                });
            }
        });

        const byChapter = Array.from(chapterStats.values()).map((c) => ({
            ...c,
            accuracy: c.total > 0 ? Math.round((c.correct / c.total) * 100) : 0
        }));

        const byDifficulty = Array.from(difficultyStats.values()).map((d) => ({
            ...d,
            accuracy: d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0
        }));

        const meta = {
            quizId,
            subject: row.subject || quiz?.subject || 'general',
            topic: row.topic || quiz?.topic || 'Practice Quiz',
            chapterId: row.chapterId || quiz?.chapterId || null,
            date: row.date,
            score: typeof row.score === 'number' ? row.score : 0,
            total: typeof row.totalQuestions === 'number' ? row.totalQuestions : questions.length,
            percentage: typeof row.percentage === 'number' ? row.percentage : 0,
            timeTaken: typeof row.timeTaken === 'number' ? row.timeTaken : 0
        };

        return {
            meta,
            byQuestion,
            byChapter,
            byDifficulty,
            wrongQuestions
        };
    }

    static async getLastTest(userId, limit = 3) {
        const tests = await TestAttempt.find({ userId, status: 'submitted' })
            .sort({ submittedAt: -1 })
            .limit(limit)
            .populate('testId', 'title')
            .lean();
        
        return tests.map(t => ({
            date: t.submittedAt,
            title: t.testId?.title || 'Test',
            score: t.results?.marksObtained || 0,
            total: t.results?.totalMarks || 0,
            percentage: t.results?.percentage || 0,
            rank: t.results?.rank,
            attempted: t.results?.attempted,
            correct: t.results?.correct
        }));
    }

    static async getOverallAccuracy(userId) {
        const user = await User.findById(userId).lean();
        return {
            accuracy: user?.analytics?.overallAccuracy || 0,
            totalQuestions: user?.analytics?.totalQuestionsAttempted || 0,
            correctAnswers: user?.analytics?.totalQuestionsCorrect || 0,
            totalStudyTime: user?.analytics?.totalStudyTime || 0
        };
    }

    static async getSubjectAccuracy(userId, subject) {
        const sessions = await SessionAttempt.find({ userId })
            .populate({
                path: 'lineId',
                match: { subject: subject.toLowerCase() }
            })
            .lean();
        
        const filtered = sessions.filter(s => s.lineId);
        const total = filtered.reduce((sum, s) => sum + s.quizzesAttempted, 0);
        const correct = filtered.reduce((sum, s) => sum + s.correctAnswers, 0);
        
        return {
            subject,
            accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
            totalQuestions: total,
            correctAnswers: correct
        };
    }

    static async getWeakTopics(userId, limit = 5) {
        const lines = await UserLine.find({ userId })
            .populate('lineId', 'ncertText subject chapter')
            .sort({ overallAccuracy: 1 })
            .limit(limit)
            .lean();
        
        return lines
            .filter(l => l.overallAccuracy < 70)
            .map(l => ({
                lineId: l.lineId?._id ? String(l.lineId._id) : (l.lineId ? String(l.lineId) : null),
                topic: l.lineId?.ncertText || 'Unknown',
                subject: l.lineId?.subject,
                chapter: l.lineId?.chapter,
                accuracy: l.overallAccuracy,
                level: l.level,
                attempts: l.totalSessions
            }));
    }

    static async getWeakChapters(userId, subject = null) {
        const user = await User.findById(userId).lean();
        let progress = user?.progress || [];
        
        if (subject) {
            progress = progress.filter(p => p.subject === subject.toLowerCase());
        }
        
        return progress
            .filter(p => p.accuracy < 70)
            .sort((a, b) => a.accuracy - b.accuracy)
            .slice(0, 5)
            .map(p => ({
                chapter: p.chapterId,
                subject: p.subject,
                accuracy: p.accuracy,
                attempted: p.totalAttempted,
                correct: p.correctAnswers,
                isWeak: p.isWeak
            }));
    }

    static async getRecentlyWrong(userId, limit = 10) {
        const sessions = await SessionAttempt.find({ userId })
            .sort({ sessionDate: -1 })
            .limit(50)
            .lean();
        
        const wrongQuestions = [];
        sessions.forEach(s => {
            if (s.review) {
                s.review.forEach((q, idx) => {
                    if (q.selectedAnswer !== null && q.selectedAnswer !== q.correctAnswer) {
                        wrongQuestions.push({
                            question: q.question,
                            yourAnswer: q.options[q.selectedAnswer],
                            correctAnswer: q.options[q.correctAnswer],
                            date: s.sessionDate
                        });
                    }
                });
            }
        });
        
        return wrongQuestions.slice(0, limit);
    }

    static async getChapterAccuracy(userId, subject, chapter) {
        const user = await User.findById(userId).lean();
        const chapterProgress = user?.progress?.find(p => 
            p.subject === subject.toLowerCase() && p.chapterId === chapter
        );
        
        return {
            subject,
            chapter,
            accuracy: chapterProgress?.accuracy || 0,
            attempted: chapterProgress?.totalAttempted || 0,
            correct: chapterProgress?.correctAnswers || 0,
            timeSpent: chapterProgress?.timeSpent || 0
        };
    }

    static async getAccuracyTrend(userId, days = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const sessions = await SessionAttempt.find({
            userId,
            sessionDate: { $gte: startDate }
        }).sort({ sessionDate: 1 }).lean();
        
        const dailyStats = {};
        sessions.forEach(s => {
            const date = new Date(s.sessionDate).toISOString().split('T')[0];
            if (!dailyStats[date]) {
                dailyStats[date] = { total: 0, correct: 0 };
            }
            dailyStats[date].total += s.quizzesAttempted;
            dailyStats[date].correct += s.correctAnswers;
        });
        
        return Object.entries(dailyStats).map(([date, stats]) => ({
            date,
            accuracy: Math.round((stats.correct / stats.total) * 100)
        }));
    }

    static async getLeaderboardPosition(userId) {
        const user = await User.findById(userId).lean();
        const rank = await User.countDocuments({
            'gamification.totalXP': { $gt: user?.gamification?.totalXP || 0 }
        }) + 1;
        
        return {
            rank,
            xp: user?.gamification?.totalXP || 0,
            level: user?.gamification?.level || 1,
            percentile: rank > 0 ? Math.round((1 - rank / await User.countDocuments()) * 100) : 0
        };
    }

    static async getMotivationalStats(userId) {
        const user = await User.findById(userId).lean();
        return {
            streak: user?.gamification?.currentStreak || 0,
            longestStreak: user?.gamification?.longestStreak || 0,
            level: user?.gamification?.level || 1,
            xp: user?.gamification?.totalXP || 0,
            coins: user?.gamification?.coins || 0,
            badges: user?.gamification?.badges?.length || 0
        };
    }

    static async getStudyHoursToday(userId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const sessions = await SessionAttempt.find({
            userId,
            sessionDate: { $gte: today }
        }).lean();
        
        const totalSeconds = sessions.reduce((sum, s) => sum + (s.timeSpent || 0), 0);
        return {
            hours: Math.floor(totalSeconds / 3600),
            minutes: Math.floor((totalSeconds % 3600) / 60),
            totalMinutes: Math.floor(totalSeconds / 60)
        };
    }

    static async getWeeklyProgress(userId) {
        const user = await User.findById(userId).lean();
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        
        const sessions = await SessionAttempt.find({
            userId,
            sessionDate: { $gte: weekStart }
        }).lean();
        
        const totalMinutes = sessions.reduce((sum, s) => sum + (s.timeSpent || 0), 0) / 60;
        const goalHours = user?.analytics?.weeklyGoalHours || 42;
        
        return {
            completed: Math.floor(totalMinutes / 60),
            goal: goalHours,
            percentage: Math.round((totalMinutes / (goalHours * 60)) * 100)
        };
    }

    static async getTestDetails(userId, testId) {
        const attempt = await TestAttempt.findOne({ userId, testId })
            .populate('testId', 'title')
            .lean();
        
        if (!attempt) return null;
        
        return {
            title: attempt.testId?.title,
            date: attempt.submittedAt,
            score: attempt.results?.marksObtained,
            total: attempt.results?.totalMarks,
            percentage: attempt.results?.percentage,
            rank: attempt.results?.rank,
            subjectWise: attempt.results?.subjectWise,
            chapterWise: attempt.results?.chapterWise,
            timeAnalysis: attempt.results?.timeAnalysis
        };
    }

    // Revision Tools
    static async getRevisionDue(userId) {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        
        const lines = await UserLine.find({
            userId,
            nextRevision: { $lte: today }
        })
        .populate('lineId', 'ncertText subject')
        .lean();
        
        return {
            total: lines.length,
            items: lines.slice(0, 10).map(l => ({
                topic: l.lineId?.ncertText,
                subject: l.lineId?.subject,
                level: l.level,
                dueDate: l.nextRevision
            }))
        };
    }

    static async getRevisionOverdue(userId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const lines = await UserLine.find({
            userId,
            nextRevision: { $lt: today }
        })
        .populate('lineId', 'ncertText subject')
        .lean();
        
        return {
            total: lines.length,
            items: lines.slice(0, 10).map(l => ({
                topic: l.lineId?.ncertText,
                subject: l.lineId?.subject,
                level: l.level,
                overdueDays: Math.floor((today - new Date(l.nextRevision)) / (1000 * 60 * 60 * 24))
            }))
        };
    }

    static async getMasteryProgress(userId) {
        const lines = await UserLine.find({ userId }).lean();
        
        const byLevel = { L1: 0, L2: 0, L3: 0, L4: 0, L5: 0, L6: 0, L7: 0 };
        lines.forEach(l => {
            byLevel[`L${l.level}`]++;
        });
        
        const mastered = lines.filter(l => l.level === 7).length;
        
        return {
            total: lines.length,
            mastered,
            byLevel,
            masteryPercentage: lines.length > 0 ? Math.round((mastered / lines.length) * 100) : 0
        };
    }

    static async getStudyStreak(userId) {
        const user = await User.findById(userId).lean();
        return {
            currentStreak: user?.gamification?.currentStreak || 0,
            longestStreak: user?.gamification?.longestStreak || 0,
            lastStudyDate: user?.gamification?.lastStudyDate
        };
    }

    // Insights
    static async getStudyInsights(userId) {
        const user = await User.findById(userId).lean();
        const weakTopics = await this.getWeakTopics(userId, 3);
        const revisionDue = await this.getRevisionDue(userId);
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const weeklySessions = await SessionAttempt.find({
            userId,
            sessionDate: { $gte: weekStart }
        }).lean();
        const weeklyMinutes = weeklySessions.reduce((sum, s) => sum + (Number(s.timeSpent || 0) / 60), 0);
        const weeklyGoalHours = Number(user?.analytics?.weeklyGoalHours || 42);
        
        return {
            totalStudyTime: user?.analytics?.totalStudyTime || 0,
            overallAccuracy: user?.analytics?.overallAccuracy || 0,
            weakTopicsCount: weakTopics.length,
            revisionsDue: revisionDue.total,
            level: user?.gamification?.level || 1,
            xp: user?.gamification?.totalXP || 0,
            weekly: {
                completedHours: Math.round((weeklyMinutes / 60) * 10) / 10,
                goalHours: weeklyGoalHours
            },
            revisionSessions: weeklySessions.length
        };
    }

    static async getNextBestAction(userId) {
        const revisionDue = await this.getRevisionDue(userId);
        const weakTopics = await this.getWeakTopics(userId, 3);
        
        if (revisionDue.total > 0) {
            return {
                action: 'revision',
                message: `You have ${revisionDue.total} topics due for revision`,
                priority: 'high'
            };
        }
        
        if (weakTopics.length > 0) {
            return {
                action: 'practice',
                message: `Focus on weak topics: ${weakTopics.map(t => t.topic).join(', ')}`,
                priority: 'medium'
            };
        }
        
        return {
            action: 'explore',
            message: 'Great job! Try new topics or take a mock test',
            priority: 'low'
        };
    }

    // Additional Missing Tools
    static async getQuizByDate(userId, startDate, endDate) {
        const sessions = await SessionAttempt.find({
            userId,
            sessionDate: { $gte: new Date(startDate), $lte: new Date(endDate) }
        })
        .populate('lineId', 'ncertText subject chapter')
        .sort({ sessionDate: -1 })
        .lean();
        
        return sessions.map(s => ({
            date: s.sessionDate,
            accuracy: s.accuracy,
            correct: s.correctAnswers,
            total: s.quizzesAttempted,
            topic: s.lineId?.ncertText,
            subject: s.lineId?.subject
        }));
    }

    static async getMasteredTopics(userId) {
        const lines = await UserLine.find({ userId, level: 7 })
            .populate('lineId', 'ncertText subject chapter')
            .lean();
        
        return lines.map(l => ({
            topic: l.lineId?.ncertText,
            subject: l.lineId?.subject,
            chapter: l.lineId?.chapter,
            masteredDate: l.updatedAt
        }));
    }

    static async getUpcomingRevisions(userId, days = 7) {
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + days);
        
        const lines = await UserLine.find({
            userId,
            nextRevision: { $lte: endDate, $gte: new Date() }
        })
        .populate('lineId', 'ncertText subject')
        .sort({ nextRevision: 1 })
        .lean();
        
        return lines.map(l => ({
            topic: l.lineId?.ncertText,
            subject: l.lineId?.subject,
            level: l.level,
            dueDate: l.nextRevision
        }));
    }

    static async getSkippedQuestions(userId, limit = 10) {
        const sessions = await SessionAttempt.find({ userId })
            .sort({ sessionDate: -1 })
            .limit(50)
            .lean();
        
        const skipped = [];
        sessions.forEach(s => {
            if (s.review) {
                s.review.forEach(q => {
                    if (q.selectedAnswer === null) {
                        skipped.push({
                            question: q.question,
                            options: q.options,
                            correctAnswer: q.options[q.correctAnswer],
                            date: s.sessionDate
                        });
                    }
                });
            }
        });
        
        return skipped.slice(0, limit);
    }

    static async getSlowQuestions(userId, limit = 10) {
        const tests = await TestAttempt.find({ userId, status: 'submitted' })
            .sort({ submittedAt: -1 })
            .limit(10)
            .populate('answers.questionId', 'question')
            .lean();
        
        const slowQuestions = [];
        tests.forEach(t => {
            t.answers?.forEach(a => {
                if (a.timeSpent > 120) { // More than 2 minutes
                    slowQuestions.push({
                        question: a.questionId?.question,
                        timeSpent: a.timeSpent,
                        isCorrect: a.isCorrect,
                        date: t.submittedAt
                    });
                }
            });
        });
        
        return slowQuestions
            .sort((a, b) => b.timeSpent - a.timeSpent)
            .slice(0, limit);
    }

    static async compareWithPeers(userId) {
        const user = await User.findById(userId).lean();
        const userXP = user?.gamification?.totalXP || 0;
        const userAccuracy = user?.analytics?.overallAccuracy || 0;
        
        const avgXP = await User.aggregate([
            { $group: { _id: null, avgXP: { $avg: '$gamification.totalXP' } } }
        ]);
        
        const avgAccuracy = await User.aggregate([
            { $group: { _id: null, avgAccuracy: { $avg: '$analytics.overallAccuracy' } } }
        ]);
        
        return {
            yourXP: userXP,
            avgXP: Math.round(avgXP[0]?.avgXP || 0),
            yourAccuracy: userAccuracy,
            avgAccuracy: Math.round(avgAccuracy[0]?.avgAccuracy || 0),
            comparison: userXP > (avgXP[0]?.avgXP || 0) ? 'above' : 'below'
        };
    }

    static async getTimeManagementTips(userId) {
        const slowQuestions = await this.getSlowQuestions(userId, 5);
        const tests = await TestAttempt.find({ userId, status: 'submitted' })
            .sort({ submittedAt: -1 })
            .limit(5)
            .lean();
        
        const avgTime = tests.reduce((sum, t) => 
            sum + (t.results?.timeAnalysis?.avgTimePerQuestion || 0), 0
        ) / (tests.length || 1);
        
        return {
            avgTimePerQuestion: Math.round(avgTime),
            slowQuestionsCount: slowQuestions.length,
            recommendation: avgTime > 90 
                ? 'Practice speed reading and quick elimination techniques'
                : 'Good time management! Keep it up'
        };
    }

    static async getQuestionReview(userId, sessionId) {
        const session = await SessionAttempt.findById(sessionId).lean();
        if (!session || session.userId.toString() !== userId.toString()) {
            return null;
        }
        return session.review || [];
    }

    static async getBenchmarkScore(userId, subject) {
        const userAccuracy = await this.getSubjectAccuracy(userId, subject);
        const avgAccuracy = await SessionAttempt.aggregate([
            {
                $lookup: {
                    from: 'ncertlines',
                    localField: 'lineId',
                    foreignField: '_id',
                    as: 'line'
                }
            },
            { $unwind: '$line' },
            { $match: { 'line.subject': subject.toLowerCase() } },
            {
                $group: {
                    _id: null,
                    avgAccuracy: { $avg: '$accuracy' }
                }
            }
        ]);
        
        const benchmark = Math.round(avgAccuracy[0]?.avgAccuracy || 0);
        return {
            subject,
            yourScore: userAccuracy.accuracy,
            benchmark,
            difference: userAccuracy.accuracy - benchmark,
            status: userAccuracy.accuracy > benchmark ? 'above' : 'below'
        };
    }

    static async suggestQuizzes(userId, filters = {}) {
        const { subject, chapter, topic, limit = 1 } = filters;

        const safeLower = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
        const subjectNorm = safeLower(subject);
        const topicNorm = typeof topic === 'string' ? topic.trim() : '';
        const limitNum = Math.max(1, Math.min(5, Number(limit) || 1));

        const chapterNumRaw = chapter !== undefined && chapter !== null ? Number.parseInt(String(chapter), 10) : NaN;
        const chapterNum = Number.isFinite(chapterNumRaw) ? chapterNumRaw : null;

        const toSafeRegex = (value) => {
            const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(escaped, 'i');
        };

        // 1) Search centralized QuizMeta first
        let chapterId = undefined;
        if (subjectNorm && chapterNum !== null) {
            const found = await Chapter.findOne({
                subject: subjectNorm,
                isActive: true,
                'ncert.chapterNumber': chapterNum
            }).select('chapterId').lean();
            chapterId = found?.chapterId;
        }

        const stored = await QuizFactoryService.searchQuizzes({
            subject: subjectNorm,
            chapterId,
            topic: topicNorm,
            limit: limitNum
        });

        if (stored.length > 0) {
            return stored.slice(0, limitNum).map(q => ({
                quizId: String(q._id),
                topic: q.topic || topicNorm || 'Practice Quiz',
                subject: q.subject || subjectNorm || 'general',
                chapter: q.chapterId || chapterId || '',
                reason: 'From saved quizzes'
            }));
        }

        // 2) Fallback: suggest NCERT lines (micro-quizzes)
        const ncertQuery = {};
        if (subjectNorm) ncertQuery.subject = subjectNorm;
        if (chapterNum !== null) ncertQuery.chapter = chapterNum;
        if (topicNorm) {
            const rx = toSafeRegex(topicNorm);
            ncertQuery.$or = [
                { ncertText: rx },
                { conceptTags: safeLower(topicNorm) }
            ];
        }

        let lines = await NCERTLine.find(ncertQuery)
            .limit(limitNum * 2)
            .lean();

        // If subject/topic mismatch, broaden to any subject for topic search.
        if (lines.length === 0 && subjectNorm && topicNorm) {
            const relaxed = { ...ncertQuery };
            delete relaxed.subject;
            lines = await NCERTLine.find(relaxed)
                .limit(limitNum * 2)
                .lean();
        }
        
        // Get user's weak topics if no filters
        if (!subjectNorm && chapterNum === null && !topicNorm) {
            const weakTopics = await this.getWeakTopics(userId, limitNum);
            if (weakTopics.length > 0) {
                const weakLineIds = weakTopics.map(t => t.lineId).filter(Boolean);
                if (weakLineIds.length > 0) {
                    const weakLines = await NCERTLine.find({ _id: { $in: weakLineIds } }).lean();
                    return weakLines.slice(0, limitNum).map(l => ({
                        lineId: l._id,
                        topic: l.ncertText || 'Practice Quiz',
                        subject: l.subject,
                        chapter: l.chapter,
                        reason: 'Weak area - needs practice'
                    }));
                }
            }
        }

        if (lines.length > 0) {
            return lines.slice(0, limitNum).map(l => ({
                lineId: l._id,
                topic: l.ncertText || topicNorm || 'Practice Quiz',
                subject: l.subject,
                chapter: l.chapter,
                reason: 'Recommended for practice'
            }));
        }

        // 3) If nothing found, generate a new 5-question quiz and store it centrally
        const generatedTopic = topicNorm || (subjectNorm && chapterNum !== null
            ? `${subjectNorm} chapter ${chapterNum}`
            : (subjectNorm ? `${subjectNorm} practice` : 'general science'));

        const inferSubjectWithAI = async (t) => {
            const topicText = String(t || '').trim();
            if (!topicText) return undefined;

            const prompt = [
                'You are a strict classifier for NEET subjects.',
                'Given a quiz topic, pick the best matching subject from this closed set: physics, chemistry, biology.',
                'Return ONLY valid JSON with this exact shape: {"subject":"biology"} (no markdown, no extra keys).',
                '',
                `Topic: "${topicText}"`
            ].join('\n');

            const raw = await GeminiService.generateText(prompt, { maxRetries: 2 });
            const cleaned = String(raw || '')
                .replace(/```json\\n?/g, '')
                .replace(/```\\n?/g, '')
                .trim();

            try {
                const parsed = JSON.parse(cleaned);
                const subj = typeof parsed?.subject === 'string' ? parsed.subject.trim().toLowerCase() : '';
                if (subj === 'physics' || subj === 'chemistry' || subj === 'biology') return subj;
            } catch (e) {
                // fall through to heuristic extraction
            }

            // Fallback: extract first mention of any allowed subject word
            const m = cleaned.toLowerCase().match(/\b(physics|chemistry|biology)\b/);
            return m ? m[1] : undefined;
        };

        let subjectForQuiz = subjectNorm || '';
        if (!subjectForQuiz) {
            subjectForQuiz = (await inferSubjectWithAI(generatedTopic)) || 'biology';
        }

        const { chapterId: resolvedChapterId, questionIds } =
            await QuizFactoryService.generateQuestionsWithAI({
                subject: subjectForQuiz,
                chapterNumber: chapterNum ?? undefined,
                topic: generatedTopic,
                count: 5,
                difficulty: 'medium',
                examTypes: ['NEET_UG']
            });

        const quiz = await QuizFactoryService.createQuiz({
            ownerUserId: userId,
            topic: generatedTopic,
            subject: subjectForQuiz,
            chapterId: resolvedChapterId,
            source: 'ai-chat',
            quizType: 'mcq',
            level: 1,
            difficulty: 'medium',
            questionIds,
            isPublished: true,
            tags: [safeLower(generatedTopic)].filter(Boolean)
        });

        return [{
            quizId: String(quiz._id),
            topic: quiz.topic,
            subject: quiz.subject,
            chapter: quiz.chapterId || '',
            reason: 'Generated now (saved for reuse)'
        }];
    }

    static async getCurriculumProgressSummary(userId, subject = null) {
        const match = { userId };
        if (subject) match.subject = String(subject).toLowerCase();

        const attempts = await ImportedSubtopicAttempt.find(
            match,
            { subject: 1, chapterId: 1, topic: 1, subTopic: 1, percentage: 1, attemptedAt: 1 }
        ).sort({ attemptedAt: -1 }).lean();

        const keyStats = new Map();
        for (const row of attempts) {
            const key = `${row.subject}|||${row.chapterId}|||${row.topic}|||${row.subTopic}`;
            if (!keyStats.has(key)) {
                keyStats.set(key, {
                    bestScore: 0,
                    attempts: 0
                });
            }
            const item = keyStats.get(key);
            item.attempts += 1;
            item.bestScore = Math.max(item.bestScore, Number(row.percentage || 0));
        }

        const attemptedSubtopics = keyStats.size;
        const completedSubtopics = Array.from(keyStats.values()).filter((v) => Number(v.bestScore || 0) >= 60).length;
        const avgBestScore = attemptedSubtopics > 0
            ? Math.round((Array.from(keyStats.values()).reduce((sum, v) => sum + Number(v.bestScore || 0), 0) / attemptedSubtopics) * 10) / 10
            : 0;

        const now = new Date();
        const activeRunMatch = {
            userId,
            status: 'in_progress',
            $or: [{ expiresAt: { $gte: now } }, { expiresAt: { $exists: false } }, { expiresAt: null }]
        };
        if (subject) activeRunMatch.subject = String(subject).toLowerCase();
        const activeRuns = await ImportedCurriculumQuizRun.countDocuments(activeRunMatch);

        const curriculumMatch = {};
        if (subject) curriculumMatch.subject = String(subject).toLowerCase();
        const chapters = await ImportedCurriculum.find(curriculumMatch, { subject: 1, topics: 1 }).lean();
        let totalAvailableSubtopics = 0;
        chapters.forEach((chapter) => {
            (chapter.topics || []).forEach((topicNode) => {
                (topicNode.sub_topics || []).forEach((subNode) => {
                    if (Array.isArray(subNode.uids) && subNode.uids.length > 0) {
                        totalAvailableSubtopics += 1;
                    }
                });
            });
        });

        const inProgressSubtopics = Math.max(0, attemptedSubtopics - completedSubtopics);
        return {
            subject: subject ? String(subject).toLowerCase() : 'all',
            attemptedSubtopics,
            completedSubtopics,
            inProgressSubtopics,
            totalAvailableSubtopics,
            completionPercentage: totalAvailableSubtopics > 0 ? Math.round((completedSubtopics / totalAvailableSubtopics) * 100) : 0,
            activeRuns,
            avgBestScore
        };
    }

    static async getCurriculumWeakSubtopics(userId, limit = 5, subject = null) {
        const match = { userId };
        if (subject) match.subject = String(subject).toLowerCase();

        const attempts = await ImportedSubtopicAttempt.find(
            match,
            { subject: 1, chapterId: 1, topic: 1, subTopic: 1, percentage: 1, attemptedAt: 1 }
        ).sort({ attemptedAt: -1 }).lean();

        const map = new Map();
        for (const row of attempts) {
            const key = `${row.subject}|||${row.chapterId}|||${row.topic}|||${row.subTopic}`;
            if (!map.has(key)) {
                map.set(key, {
                    subject: row.subject,
                    chapterId: row.chapterId,
                    topic: row.topic,
                    subTopic: row.subTopic,
                    attempts: 0,
                    bestScore: 0,
                    lastScore: Number(row.percentage || 0),
                    lastAttemptAt: row.attemptedAt || null
                });
            }
            const entry = map.get(key);
            entry.attempts += 1;
            entry.bestScore = Math.max(entry.bestScore, Number(row.percentage || 0));
        }

        return Array.from(map.values())
            .filter((item) => item.attempts > 0 && Number(item.bestScore || 0) < 60)
            .sort((a, b) => Number(a.bestScore || 0) - Number(b.bestScore || 0))
            .slice(0, Math.max(1, Number(limit) || 5));
    }

    static async getCurriculumResumeQueue(userId, limit = 5) {
        const rows = await ImportedCurriculumQuizRun.find({
            userId,
            status: 'in_progress',
            $or: [{ expiresAt: { $gte: new Date() } }, { expiresAt: null }, { expiresAt: { $exists: false } }]
        })
            .sort({ lastActivityAt: -1 })
            .limit(Math.max(1, Number(limit) || 5))
            .lean();

        return rows.map((run) => ({
            runId: String(run._id),
            subject: run.subject,
            chapterId: run.chapterId,
            topic: run.topic,
            subTopic: run.subTopic,
            mode: run.mode,
            attemptedQuestions: Number(run.attemptedQuestions || 0),
            totalQuestions: Number(run.totalQuestions || (run.uids || []).length || 0),
            lastActivityAt: run.lastActivityAt || null,
            expiresAt: run.expiresAt || null
        }));
    }

    static async getMockTestCompletionSummary(userId, filters = {}) {
        const query = { isActive: true };
        const examType = filters?.examType ? String(filters.examType) : null;
        const testType = filters?.testType ? String(filters.testType) : null;
        const classCategory = filters?.classCategory ? String(filters.classCategory) : null;
        const freeOnly = filters?.freeOnly === true || filters?.freeOnly === 'true';

        if (examType) query.examType = examType;
        if (testType) query.testType = testType;
        if (classCategory && classCategory !== 'all') query.classCategory = classCategory;
        if (freeOnly) query.accessType = 'FREE';

        const tests = await MockTest.find(query, { testId: 1, title: 1 }).lean();
        const ids = tests.map((t) => t.testId);
        const progress = await MockTestProgress.find({ userId, testId: { $in: ids } }).lean();
        const completedSet = new Set(progress.filter((p) => p.completed).map((p) => p.testId));
        const completed = tests.filter((t) => completedSet.has(t.testId)).length;

        return {
            totalTests: tests.length,
            completedTests: completed,
            pendingTests: Math.max(0, tests.length - completed),
            completionPercentage: tests.length > 0 ? Math.round((completed / tests.length) * 100) : 0
        };
    }

    static async getMockPendingTests(userId, limit = 5, filters = {}) {
        const query = { isActive: true };
        if (filters?.examType) query.examType = String(filters.examType);
        if (filters?.testType) query.testType = String(filters.testType);
        if (filters?.classCategory && String(filters.classCategory) !== 'all') query.classCategory = String(filters.classCategory);
        if (filters?.freeOnly === true || filters?.freeOnly === 'true') query.accessType = 'FREE';

        const tests = await MockTest.find(query, {
            testId: 1,
            title: 1,
            testType: 1,
            classCategory: 1,
            resources: 1,
            examType: 1
        }).lean();
        const ids = tests.map((t) => t.testId);
        const progress = await MockTestProgress.find({ userId, testId: { $in: ids } }).lean();
        const completedSet = new Set(progress.filter((p) => p.completed).map((p) => p.testId));

        return tests
            .filter((t) => !completedSet.has(t.testId))
            .slice(0, Math.max(1, Number(limit) || 5))
            .map((t) => ({
                id: String(t._id),
                testId: t.testId,
                title: t.title,
                examType: t.examType,
                testType: t.testType,
                classCategory: t.classCategory,
                questionPdf: t.resources?.questionPdf || null,
                answerPdf: t.resources?.answerPdf || null
            }));
    }

    static async getCombinedPerformanceTrend(userId, days = 14) {
        const daysNum = Math.max(1, Math.min(90, Number(days) || 14));
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() - (daysNum - 1));

        const [quizRows, curriculumRows, testRows] = await Promise.all([
            QuizMeta.aggregate([
                { $match: { attempts: { $exists: true, $ne: [] } } },
                { $unwind: '$attempts' },
                { $match: { 'attempts.userId': userId, 'attempts.attemptDate': { $gte: startDate } } },
                {
                    $project: {
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$attempts.attemptDate' } },
                        score: { $ifNull: ['$attempts.percentage', 0] }
                    }
                }
            ]).exec(),
            ImportedSubtopicAttempt.aggregate([
                { $match: { userId, attemptedAt: { $gte: startDate } } },
                {
                    $project: {
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$attemptedAt' } },
                        score: { $ifNull: ['$percentage', 0] }
                    }
                }
            ]).exec(),
            TestAttempt.aggregate([
                { $match: { userId, submittedAt: { $gte: startDate }, status: { $in: ['submitted', 'COMPLETED'] } } },
                {
                    $project: {
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$submittedAt' } },
                        score: { $ifNull: ['$results.percentage', 0] }
                    }
                }
            ]).exec()
        ]);

        const map = new Map();
        const pushMetric = (date, field, value) => {
            if (!map.has(date)) {
                map.set(date, {
                    date,
                    quizzes: [],
                    curriculum: [],
                    tests: []
                });
            }
            map.get(date)[field].push(Number(value || 0));
        };

        quizRows.forEach((row) => pushMetric(row.date, 'quizzes', row.score));
        curriculumRows.forEach((row) => pushMetric(row.date, 'curriculum', row.score));
        testRows.forEach((row) => pushMetric(row.date, 'tests', row.score));

        const result = Array.from(map.values())
            .sort((a, b) => String(a.date).localeCompare(String(b.date)))
            .map((row) => {
                const avg = (arr) => (arr.length > 0
                    ? Math.round((arr.reduce((sum, v) => sum + Number(v || 0), 0) / arr.length) * 10) / 10
                    : null);
                const quizAvg = avg(row.quizzes);
                const curriculumAvg = avg(row.curriculum);
                const testAvg = avg(row.tests);
                const all = [quizAvg, curriculumAvg, testAvg].filter((v) => typeof v === 'number');
                const overall = all.length > 0
                    ? Math.round((all.reduce((sum, v) => sum + Number(v || 0), 0) / all.length) * 10) / 10
                    : null;

                return {
                    date: row.date,
                    quizzes: quizAvg,
                    curriculum: curriculumAvg,
                    tests: testAvg,
                    overall,
                    samples: row.quizzes.length + row.curriculum.length + row.tests.length
                };
            });

        const validOverall = result.filter((d) => typeof d.overall === 'number');
        let summary = { status: 'unknown', change: 0 };
        if (validOverall.length >= 2) {
            const first = Number(validOverall[0].overall || 0);
            const last = Number(validOverall[validOverall.length - 1].overall || 0);
            const diff = Math.round((last - first) * 10) / 10;
            summary = {
                status: diff > 2 ? 'improving' : diff < -2 ? 'declining' : 'stable',
                change: diff
            };
        }

        return { days: daysNum, trend: result, summary };
    }

    static async buildTodayActionPlan(userId, timeBudgetMinutes = 90, maxTasks = 3) {
        const budget = Math.max(30, Math.min(360, Number(timeBudgetMinutes) || 90));
        const cap = Math.max(1, Math.min(8, Number(maxTasks) || 3));

        const [resumeQueue, weakSubtopics, pendingMocks, weakTopics] = await Promise.all([
            this.getCurriculumResumeQueue(userId, 3),
            this.getCurriculumWeakSubtopics(userId, 5),
            this.getMockPendingTests(userId, 5),
            this.getWeakTopics(userId, 5)
        ]);

        const tasks = [];

        for (const run of resumeQueue) {
            if (tasks.length >= cap) break;
            tasks.push({
                id: `resume-${run.runId}`,
                title: `Resume ${run.mode === 'test' ? 'Test' : 'Practice'}: ${run.subTopic}`,
                reason: `You already attempted ${run.attemptedQuestions}/${run.totalQuestions} questions.`,
                durationMinutes: 30,
                priority: 'high',
                actionType: 'resume_curriculum',
                payload: {
                    runId: run.runId,
                    subject: run.subject,
                    chapterId: run.chapterId,
                    topic: run.topic,
                    subTopic: run.subTopic
                }
            });
        }

        for (const sub of weakSubtopics) {
            if (tasks.length >= cap) break;
            const exists = tasks.some((t) => t.payload?.subTopic === sub.subTopic && t.payload?.chapterId === sub.chapterId);
            if (exists) continue;
            tasks.push({
                id: `weak-subtopic-${sub.subject}-${sub.chapterId}-${sub.subTopic}`.replace(/\s+/g, '-').toLowerCase(),
                title: `Improve weak subtopic: ${sub.subTopic}`,
                reason: `Best score ${sub.bestScore}% across ${sub.attempts} attempts.`,
                durationMinutes: 25,
                priority: 'high',
                actionType: 'start_curriculum_quiz',
                payload: {
                    subject: sub.subject,
                    chapterId: sub.chapterId,
                    topic: sub.topic,
                    subTopic: sub.subTopic,
                    mode: 'practice'
                }
            });
        }

        for (const mock of pendingMocks) {
            if (tasks.length >= cap) break;
            tasks.push({
                id: `pending-mock-${mock.id}`,
                title: `Take pending mock: ${mock.title}`,
                reason: 'Pending mock test can improve exam readiness.',
                durationMinutes: 45,
                priority: 'medium',
                actionType: mock.questionPdf ? 'open_mock_pdf' : 'open_test_series',
                payload: {
                    mockId: mock.id,
                    testId: mock.testId,
                    title: mock.title,
                    questionPdf: mock.questionPdf || null
                }
            });
        }

        for (const topic of weakTopics) {
            if (tasks.length >= cap) break;
            tasks.push({
                id: `weak-topic-${String(topic.lineId || topic.topic).replace(/\s+/g, '-').toLowerCase()}`,
                title: `Practice weak topic: ${topic.topic}`,
                reason: `Current accuracy ${topic.accuracy || 0}%.`,
                durationMinutes: 20,
                priority: 'medium',
                actionType: 'start_ai_quiz',
                payload: {
                    topic: topic.topic,
                    subject: topic.subject || 'general',
                    chapter: topic.chapter || ''
                }
            });
        }

        const cappedTasks = tasks.slice(0, cap);
        const totalAllocatedMinutes = cappedTasks.reduce((sum, t) => sum + Number(t.durationMinutes || 0), 0);

        return {
            generatedAt: new Date(),
            timeBudgetMinutes: budget,
            maxTasks: cap,
            totalAllocatedMinutes,
            tasks: cappedTasks
        };
    }
}

module.exports = AITools;
