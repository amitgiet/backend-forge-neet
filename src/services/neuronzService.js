const UserLine = require('../models/UserLine');
const NCERTLine = require('../models/NCERTLine');
const User = require('../models/User');
const GeminiService = require('./geminiService');
const mongoose = require('mongoose');

class NeuronzService {
    // Level intervals in hours: L1=24h, L2=72h(3d), L3=120h(5d), L4=168h(7d), L5=240h(10d), L6=360h(15d), L7=720h(30d)
    static LEVEL_INTERVALS = [0, 24, 72, 120, 168, 240, 360, 720];

    // Daily limits
    static DAILY_LIMITS = {
        free: 50,
        pro: Infinity
    };

    /**
     * Get due NCERT lines for user (Due Today dashboard)
     */
    static async getDueLines(userId, userPlan = 'free') {
        try {
            const limit = this.DAILY_LIMITS[userPlan] || 50;

            const dueLines = await UserLine.getDueLines(userId, limit);

            // Group by level for UI display
            const groupedByLevel = {
                L1: [], L2: [], L3: [], L4: [], L5: [], L6: [], L7: []
            };

            dueLines.forEach(ul => {
                const levelKey = `L${ul.level}`;
                if (groupedByLevel[levelKey]) {
                    groupedByLevel[levelKey].push(ul);
                }
            });

            return {
                total: dueLines.length,
                byLevel: groupedByLevel,
                lines: dueLines,
                dailyLimit: limit,
                limitReached: dueLines.length >= limit && userPlan === 'free'
            };

        } catch (error) {
            throw new Error(`Failed to get due lines: ${error.message}`);
        }
    }

    /**
     * Process quiz session results for a line
     */
    static async processLineSession(userId, lineId, correctAnswers, totalQuizzes = 4, timeSpent = 0) {
        try {
            const userLine = await UserLine.createOrUpdate(
                userId,
                lineId,
                correctAnswers,
                totalQuizzes,
                timeSpent
            );

            // Update user's daily progress
            await this.updateUserDailyProgress(userId, correctAnswers, totalQuizzes);

            return {
                newLevel: userLine.level,
                nextRevision: userLine.nextRevision,
                streak: userLine.streak,
                isMastered: userLine.isMastered,
                accuracy: Math.round((correctAnswers / totalQuizzes) * 100),
                levelAdvanced: correctAnswers >= 3 // 75% success rate
            };

        } catch (error) {
            throw new Error(`Failed to process line session: ${error.message}`);
        }
    }

    /**
     * Generate 4 micro-quizzes for an NCERT line using AI
     */
    static async generateMicroQuizzes(lineId) {
        try {
            const ncertLine = await NCERTLine.findOne({ lineId });
            if (!ncertLine) {
                throw new Error('NCERT line not found');
            }

            // Check if we have fresh cached quizzes (less than 24 hours old)
            const hasRecentQuizzes = ncertLine.generatedQuizzes &&
                ncertLine.generatedQuizzes.length >= 4 &&
                ncertLine.generatedQuizzes[0].generatedAt > new Date(Date.now() - 24 * 60 * 60 * 1000);

            if (hasRecentQuizzes) {
                return ncertLine.generatedQuizzes.slice(0, 4);
            }

            // Generate new quizzes using Gemini AI
            const geminiService = new GeminiService();
            const aiQuizzes = await geminiService.generateMicroQuizzes({
                ncertText: ncertLine.ncertText,
                subject: ncertLine.subject,
                class: ncertLine.class,
                chapter: ncertLine.chapter
            });

            // Format and cache the generated quizzes
            const formattedQuizzes = aiQuizzes.map(quiz => ({
                question: quiz.question,
                options: quiz.options,
                correctAnswer: quiz.correctAnswer,
                explanation: quiz.explanation,
                generatedAt: new Date()
            }));

            // Update the NCERT line with new quizzes
            ncertLine.generatedQuizzes = formattedQuizzes;
            await ncertLine.save();

            return formattedQuizzes;

        } catch (error) {
            console.error('Error in generateMicroQuizzes:', error);

            // Fallback to mock quizzes if AI fails
            return this.getMockQuizzes(lineId);
        }
    }

    /**
     * Fallback mock quizzes if AI service fails
     */
    static getMockQuizzes(lineId) {
        return [
            {
                question: `What is the main concept discussed in this NCERT line?`,
                options: ['Option A', 'Option B', 'Option C', 'Option D'],
                correctAnswer: 1,
                explanation: 'This is based on the NCERT line content.'
            },
            {
                question: `Which statement best describes the given concept?`,
                options: ['Statement 1', 'Statement 2', 'Statement 3', 'Statement 4'],
                correctAnswer: 2,
                explanation: 'This tests understanding of the concept.'
            },
            {
                question: `The key term in this line refers to:`,
                options: ['Term A', 'Term B', 'Term C', 'Term D'],
                correctAnswer: 0,
                explanation: 'This focuses on terminology.'
            },
            {
                question: `What can be inferred from this concept?`,
                options: ['Inference 1', 'Inference 2', 'Inference 3', 'Inference 4'],
                correctAnswer: 3,
                explanation: 'This tests deeper understanding.'
            }
        ];
    }

    /**
     * Get user's NeuronZ statistics
     */
    static async getUserStats(userId) {
        try {
            const stats = await UserLine.aggregate([
                { $match: { userId: new mongoose.Types.ObjectId(userId) } },
                {
                    $group: {
                        _id: '$level',
                        count: { $sum: 1 },
                        avgStreak: { $avg: '$streak' },
                        totalCorrect: { $sum: '$totalCorrectAnswers' },
                        totalAttempts: { $sum: '$totalQuizzesSolved' }
                    }
                },
                { $sort: { _id: 1 } }
            ]);

            const masteredCount = await UserLine.countDocuments({
                userId,
                isMastered: true
            });

            const dueCount = await UserLine.countDocuments({
                userId,
                nextRevision: { $lte: new Date() }
            });

            return {
                levelDistribution: stats,
                masteredLines: masteredCount,
                dueToday: dueCount,
                totalLines: await UserLine.countDocuments({ userId })
            };

        } catch (error) {
            throw new Error(`Failed to get user stats: ${error.message}`);
        }
    }

    /**
     * Check if user has reached daily limit
     */
    static async checkDailyLimit(userId, userPlan = 'free') {
        if (userPlan === 'pro') return { limitReached: false };

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayAttempts = await UserLine.countDocuments({
            userId,
            lastReviewed: { $gte: today }
        });

        return {
            limitReached: todayAttempts >= this.DAILY_LIMITS.free,
            attemptsToday: todayAttempts,
            limit: this.DAILY_LIMITS.free
        };
    }

    /**
     * Get lines by level for targeted practice
     */
    static async getLinesByLevel(userId, level, limit = 20) {
        try {
            return await UserLine.find({
                userId,
                level,
                nextRevision: { $lte: new Date() }
            })
                .populate('lineId')
                .limit(limit);

        } catch (error) {
            throw new Error(`Failed to get lines by level: ${error.message}`);
        }
    }

    /**
     * Reset line to L1 (for difficult lines)
     */
    static async resetLineLevel(userId, lineId) {
        try {
            const userLine = await UserLine.findOne({ userId, lineId });
            if (!userLine) {
                throw new Error('Line not found for user');
            }

            userLine.level = 1;
            userLine.nextRevision = new Date(Date.now() + 24 * 60 * 60 * 1000);
            userLine.streak = 0;
            userLine.isMastered = false;

            return await userLine.save();

        } catch (error) {
            throw new Error(`Failed to reset line level: ${error.message}`);
        }
    }

    /**
     * Update user's daily progress and streak
     */
    static async updateUserDailyProgress(userId, correctAnswers, totalQuizzes) {
        try {
            const user = await User.findById(userId);
            if (!user) return;

            // Update streak
            user.updateStreak();

            // Update analytics
            user.analytics.totalQuestionsAttempted += totalQuizzes;
            user.analytics.totalQuestionsCorrect += correctAnswers;

            user.analytics.overallAccuracy = user.calculateOverallAccuracy();

            await user.save();

        } catch (error) {
            console.error('Failed to update user daily progress:', error);
        }
    }

    /**
     * Get mastery progress for dashboard
     */
    static async getMasteryProgress(userId) {
        try {
            const progress = await UserLine.aggregate([
                { $match: { userId: new mongoose.Types.ObjectId(userId) } },
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        mastered: {
                            $sum: { $cond: [{ $eq: ['$level', 7] }, 1, 0] }
                        },
                        avgLevel: { $avg: '$level' }
                    }
                }
            ]);

            const result = progress[0] || { total: 0, mastered: 0, avgLevel: 1 };

            return {
                totalLines: result.total,
                masteredLines: result.mastered,
                masteryPercentage: result.total > 0 ? Math.round((result.mastered / result.total) * 100) : 0,
                averageLevel: Math.round(result.avgLevel * 10) / 10
            };


        } catch (error) {
            throw new Error(`Failed to get mastery progress: ${error.message}`);
        }
    }

    /**
     * Get lines by chapter for content browser
     */
    static async getLinesByChapter(userId, chapterId, subject, ncertClass) {
        try {
            const query = {};
            if (chapterId) query.chapter = chapterId;
            if (subject) query.subject = subject;
            if (ncertClass) query.class = ncertClass;

            const ncertLines = await NCERTLine.find(query).sort({ pageNumber: 1, lineNumber: 1 });

            // Get user's progress for these lines
            const lineIds = ncertLines.map(line => line.lineId);
            const userLines = await UserLine.find({
                userId,
                lineId: { $in: lineIds }
            });

            const userLinesMap = userLines.reduce((acc, ul) => {
                acc[ul.lineId] = ul;
                return acc;
            }, {});

            // Merge progress info
            return ncertLines.map(line => ({
                ...line.toObject(),
                userProgress: userLinesMap[line.lineId] ? {
                    level: userLinesMap[line.lineId].level,
                    isMastered: userLinesMap[line.lineId].isMastered,
                    nextRevision: userLinesMap[line.lineId].nextRevision
                } : null
            }));

        } catch (error) {
            throw new Error(`Failed to get lines by chapter: ${error.message}`);
        }
    }
}

module.exports = NeuronzService;