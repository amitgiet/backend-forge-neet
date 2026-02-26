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
     * Resolve NCERT line by either Mongo _id or business lineId.
     */
    static async resolveNCERTLine(lineIdentifier) {
        if (!lineIdentifier) return null;

        let ncertLine = null;
        const lineValue = String(lineIdentifier);

        if (mongoose.Types.ObjectId.isValid(lineValue)) {
            ncertLine = await NCERTLine.findById(lineValue);
        }

        if (!ncertLine) {
            ncertLine = await NCERTLine.findOne({ lineId: lineValue });
        }

        return ncertLine;
    }

    /**
     * Resolve UserLine by supporting both NCERT _id-based and lineId-based records.
     */
    static async resolveUserLine(userId, lineIdentifier) {
        if (!lineIdentifier) return null;

        const lineValue = String(lineIdentifier);
        let userLine = await UserLine.findOne({ userId, lineId: lineValue });
        if (userLine) return userLine;

        const ncertLine = await this.resolveNCERTLine(lineValue);
        if (!ncertLine) return null;

        const candidates = [String(ncertLine._id), ncertLine.lineId];
        userLine = await UserLine.findOne({
            userId,
            lineId: { $in: candidates }
        });

        return userLine;
    }

    /**
     * Get due NCERT lines for user (Due Today dashboard)
     */
    static async getDueLines(userId, userPlan = 'free') {
        try {
            const limit = this.DAILY_LIMITS[userPlan] || 50;

            console.log(`[getDueLines] Fetching due lines for userId: ${userId}`);

            const dueLines = await UserLine.getDueLines(userId, limit);
            const lineIdentifiers = dueLines.map(ul => String(ul.lineId));

            const objectIdKeys = lineIdentifiers.filter(id => mongoose.Types.ObjectId.isValid(id));
            const businessKeys = lineIdentifiers.filter(id => !mongoose.Types.ObjectId.isValid(id));

            const [byObjectIds, byBusinessIds] = await Promise.all([
                objectIdKeys.length > 0
                    ? NCERTLine.find({ _id: { $in: objectIdKeys } }).select('lineId ncertText subject chapter class book')
                    : [],
                businessKeys.length > 0
                    ? NCERTLine.find({ lineId: { $in: businessKeys } }).select('lineId ncertText subject chapter class book')
                    : []
            ]);

            const lineMap = new Map();
            [...byObjectIds, ...byBusinessIds].forEach(line => {
                lineMap.set(String(line._id), line.toObject());
                lineMap.set(String(line.lineId), line.toObject());
            });

            const enrichedLines = dueLines.map(ul => {
                const item = ul.toObject();
                const matchedLine = lineMap.get(String(item.lineId));
                if (matchedLine) {
                    item.lineId = matchedLine;
                }
                return item;
            });

            // Deduplicate same NCERT content represented by legacy/new lineId formats.
            const uniqueLineMap = new Map();
            for (const item of enrichedLines) {
                const canonicalKey =
                    item.lineId && typeof item.lineId === 'object' && item.lineId._id
                        ? String(item.lineId._id)
                        : String(item.lineId);

                const existing = uniqueLineMap.get(canonicalKey);
                if (!existing) {
                    uniqueLineMap.set(canonicalKey, item);
                    continue;
                }

                // Prefer higher level; tie-breaker by most recently reviewed.
                const existingReviewed = new Date(existing.lastReviewed || 0).getTime();
                const currentReviewed = new Date(item.lastReviewed || 0).getTime();
                const shouldReplace =
                    (item.level || 0) > (existing.level || 0) ||
                    ((item.level || 0) === (existing.level || 0) && currentReviewed > existingReviewed);

                if (shouldReplace) {
                    uniqueLineMap.set(canonicalKey, item);
                }
            }

            const uniqueLines = Array.from(uniqueLineMap.values()).sort((a, b) => {
                if ((a.level || 0) !== (b.level || 0)) return (a.level || 0) - (b.level || 0);
                return new Date(b.lastReviewed || 0).getTime() - new Date(a.lastReviewed || 0).getTime();
            });

            console.log(`[getDueLines] Found ${uniqueLines.length} due lines`);

            // Group by level for UI display
            const groupedByLevel = {
                L1: [], L2: [], L3: [], L4: [], L5: [], L6: [], L7: []
            };

            uniqueLines.forEach(ul => {
                const levelKey = `L${ul.level}`;
                if (groupedByLevel[levelKey]) {
                    groupedByLevel[levelKey].push(ul);
                }
            });

            return {
                total: uniqueLines.length,
                byLevel: groupedByLevel,
                lines: uniqueLines,
                dailyLimit: limit,
                limitReached: uniqueLines.length >= limit && userPlan === 'free'
            };

        } catch (error) {
            console.error('[getDueLines] Error:', error);
            throw new Error(`Failed to get due lines: ${error.message}`);
        }
    }

    /**
     * Process quiz session results for a line
     */
    static async processLineSession(userId, lineId, correctAnswers, totalQuizzes = 4, timeSpent = 0) {
        try {
            const ncertLine = await this.resolveNCERTLine(lineId);
            const canonicalLineId = ncertLine ? String(ncertLine._id) : String(lineId);
            const duplicateKeys = ncertLine ? [String(ncertLine._id), String(ncertLine.lineId)] : [String(lineId)];

            let userLine = await UserLine.findOne({ userId, lineId: canonicalLineId });
            if (!userLine) {
                userLine = await this.resolveUserLine(userId, lineId);
            }
            if (!userLine) {
                userLine = new UserLine({ userId, lineId: canonicalLineId });
            }

            userLine.updateLevel(correctAnswers, totalQuizzes, timeSpent);
            userLine.lineId = canonicalLineId;
            await userLine.save();

            // Remove legacy duplicates for the same NCERT line representation.
            const duplicateRows = await UserLine.find({
                userId,
                lineId: { $in: duplicateKeys }
            }).select('_id');

            const duplicateIdsToDelete = duplicateRows
                .map(row => String(row._id))
                .filter(id => id !== String(userLine._id));

            if (duplicateIdsToDelete.length > 0) {
                await UserLine.deleteMany({ _id: { $in: duplicateIdsToDelete } });
            }

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
            const ncertLine = await this.resolveNCERTLine(lineId);
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
            const userLine = await this.resolveUserLine(userId, lineId);
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

    /**
     * Track a chapter for user - create UserLine entries for all NCERT lines in the chapter
     */
    static async trackChapterForUser(userId, chapterId) {
        try {
            // First, get the Chapter to understand its subject and other details
            const Chapter = require('../models/Chapter');
            const chapter = await Chapter.findById(chapterId);
            
            if (!chapter) {
                throw new Error('Chapter not found');
            }

            // Find all NCERT lines for this chapter
            // Match by subject and chapter number
            const query = {
                subject: chapter.subject,
                chapter: chapter.ncert.chapterNumber
            };

            const ncertLines = await NCERTLine.find(query);
            
            if (!ncertLines || ncertLines.length === 0) {
                throw new Error('No NCERT lines found for this chapter');
            }

            let addedCount = 0;
            const createdUserLines = [];

            // Create or update UserLine for each NCERT line
            for (const ncertLine of ncertLines) {
                const existingUserLine = await this.resolveUserLine(userId, String(ncertLine._id));

                if (!existingUserLine) {
                    // Create new UserLine entry at Level 1
                    const newUserLine = new UserLine({
                        userId,
                        lineId: ncertLine._id, // Store MongoDB _id
                        level: 1,
                        nextRevision: new Date(), // L1: Due TODAY
                        lastReviewed: new Date(),
                        streak: 0,
                        isMastered: false
                    });
                    
                    await newUserLine.save();
                    createdUserLines.push(newUserLine);
                    addedCount++;
                }
            }

            return {
                added: addedCount,
                total: ncertLines.length,
                lines: createdUserLines
            };

        } catch (error) {
            throw new Error(`Failed to track chapter: ${error.message}`);;
        }
    }

    /**
     * Track by subject and topic (for NeuronZ practice)
     */
    static async trackBySubjectAndTopic(userId, subject, topic) {
        try {
            console.log(`[trackBySubjectAndTopic] Starting for userId: ${userId}, subject: ${subject}, topic: ${topic}`);
            
            // Find NCERT lines by subject and topic
            let ncertLines = await NCERTLine.find({
                subject: { $regex: subject, $options: 'i' },
                isActive: true,
                $or: [
                    { ncertText: { $regex: topic, $options: 'i' } },
                    { conceptTags: { $regex: topic, $options: 'i' } }
                ]
            }).limit(100);

            console.log(`[trackBySubjectAndTopic] Found ${ncertLines.length} NCERT lines by topic search`);

            // If no lines found with topic, try broader search by subject only
            if (!ncertLines || ncertLines.length === 0) {
                console.log(`[trackBySubjectAndTopic] No lines found for ${subject} - ${topic}, searching by subject only...`);
                ncertLines = await NCERTLine.find({
                    subject: { $regex: subject, $options: 'i' },
                    isActive: true
                }).limit(100);
                console.log(`[trackBySubjectAndTopic] Found ${ncertLines.length} NCERT lines by subject search`);
            }

            // If still no lines, create mock NCERT lines for demo purposes
            if (!ncertLines || ncertLines.length === 0) {
                console.log(`[trackBySubjectAndTopic] No NCERT lines in database. Creating mock content for ${subject} - ${topic}`);
                
                // Create mock NCERT lines for the topic
                const mockLines = [];
                for (let i = 1; i <= 10; i++) {
                    mockLines.push({
                        lineId: `${subject}-${topic.replace(/\s+/g, '-')}-${i}`,
                        subject: subject.toLowerCase(),
                        class: 12,
                        chapter: 1,
                        pageNumber: i,
                        lineNumber: i,
                        ncertText: `${topic} - Concept ${i}: This is a mock NCERT line for demonstration purposes.`,
                        context: `Learning about ${topic}`,
                        conceptTags: [topic.toLowerCase()],
                        isActive: true
                    });
                }
                
                try {
                    const created = await NCERTLine.insertMany(mockLines);
                    console.log(`[trackBySubjectAndTopic] ✅ Created ${created.length} mock NCERT lines`);
                    ncertLines = created;
                } catch (insertError) {
                    console.log(`[trackBySubjectAndTopic] Insert failed (lines may exist): ${insertError.message}`);
                    // Lines might already exist, just fetch them
                    ncertLines = await NCERTLine.find({
                        subject: { $regex: subject, $options: 'i' }
                    }).limit(100);
                }
            }

            if (!ncertLines || ncertLines.length === 0) {
                throw new Error(`No NCERT lines available for ${subject} - ${topic}. Please check database or add content.`);
            }

            let addedCount = 0;
            const createdUserLines = [];

            console.log(`[trackBySubjectAndTopic] Creating UserLine entries for ${ncertLines.length} NCERT lines`);

            // Create UserLine entries for each NCERT line at Level 1
            // Do not reset existing progress unless explicitly requested.
            for (const ncertLine of ncertLines) {
                const existingUserLine = await this.resolveUserLine(userId, String(ncertLine._id));

                if (!existingUserLine) {
                    const newUserLine = new UserLine({
                        userId,
                        lineId: ncertLine._id, // Store MongoDB _id for proper population
                        level: 1,
                        nextRevision: new Date(), // L1: Due TODAY (now)
                        lastReviewed: new Date(),
                        streak: 0,
                        isMastered: false
                    });
                    
                    await newUserLine.save();
                    createdUserLines.push(newUserLine);
                    addedCount++;
                }
            }

            console.log(`[trackBySubjectAndTopic] ✅ Created/Updated ${addedCount} UserLine entries`);

            return {
                added: addedCount,
                total: ncertLines.length,
                subject,
                topic,
                message: `Started NeuronZ Level 1 with ${addedCount} new MCQs`
            };

        } catch (error) {
            console.error('[trackBySubjectAndTopic] Error:', error);
            throw new Error(`Failed to track topic: ${error.message}`);
        }
    }

    /**
     * Manually adjust line level
     */
    static async adjustLineLevel(userId, lineId, newLevel, reason = 'user-request') {
        try {
            const userLine = await this.resolveUserLine(new mongoose.Types.ObjectId(userId), lineId);
            if (!userLine) {
                throw new Error('Line not found');
            }

            const oldLevel = userLine.level;
            userLine.level = newLevel;
            userLine.nextRevision = userLine.getNextRevisionDate(newLevel);
            userLine.lastReviewed = new Date();

            // Track the adjustment in quiz history
            userLine.quizHistory.push({
                sessionDate: new Date(),
                quizzesAttempted: 0,
                correctAnswers: 0,
                accuracy: 100,
                levelAfter: newLevel,
                timeSpent: 0,
                isAdjustment: true,
                adjustmentReason: reason
            });

            await userLine.save();

            console.log(`[Level Adjustment] User ${userId} adjusted line ${lineId}: L${oldLevel}→L${newLevel} (${reason})`);

            return {
                lineId,
                oldLevel,
                newLevel,
                nextRevision: userLine.nextRevision,
                message: `Level adjusted from ${oldLevel} to ${newLevel}`
            };

        } catch (error) {
            throw new Error(`Failed to adjust level: ${error.message}`);
        }
    }

    /**
     * Customize line schedule and priority
     */
    static async customizeLineSchedule(userId, lineId, priority, customSchedule, autoSkipL7) {
        try {
            const userLine = await this.resolveUserLine(new mongoose.Types.ObjectId(userId), lineId);
            if (!userLine) {
                throw new Error('Line not found');
            }

            if (priority) {
                userLine.priority = priority; // 'low', 'normal', 'urgent'
            }

            if (customSchedule && customSchedule.enabled && customSchedule.intervals) {
                userLine.customSchedule = customSchedule;
                // Recalculate next revision with custom intervals
                const daysForLevel = customSchedule.intervals[userLine.level - 1] || 1;
                userLine.nextRevision = new Date(Date.now() + daysForLevel * 24 * 60 * 60 * 1000);
            }

            if (autoSkipL7 !== undefined) {
                userLine.autoSkipL7 = autoSkipL7;
            }

            await userLine.save();

            return {
                lineId,
                priority: userLine.priority,
                customSchedule: userLine.customSchedule,
                autoSkipL7: userLine.autoSkipL7,
                nextRevision: userLine.nextRevision
            };

        } catch (error) {
            throw new Error(`Failed to customize schedule: ${error.message}`);
        }
    }

    /**
     * Get detailed analytics for a line
     */
    static async getLineAnalytics(userId, lineId) {
        try {
            const userLine = await this.resolveUserLine(new mongoose.Types.ObjectId(userId), lineId);
            if (!userLine) {
                throw new Error('Line not found');
            }

            await userLine.populate({
                path: 'lineId',
                select: 'ncertText subject chapter class book',
                options: { strictPopulate: false }
            });

            const { quizHistory, totalQuizzesSolved, totalCorrectAnswers, level, isMastered } = userLine;

            // Accuracy trend
            const accuracyTrend = quizHistory.map((session, idx) => ({
                sessionNumber: idx + 1,
                date: session.sessionDate,
                accuracy: session.accuracy,
                level: session.levelAfter
            }));

            // Recent accuracy (last 5 sessions)
            const recentSessions = accuracyTrend.slice(-5);
            const recentAccuracy = recentSessions.length > 0 
                ? recentSessions.reduce((sum, s) => sum + s.accuracy, 0) / recentSessions.length
                : 0;

            // Time analysis
            const timeSessions = quizHistory.filter(s => s.timeSpent && s.timeSpent > 0);
            const avgTime = timeSessions.length > 0
                ? timeSessions.reduce((sum, s) => sum + s.timeSpent, 0) / timeSessions.length
                : 0;

            // Mastery forecast
            const masteryForecast = this.forecastMasteryDate(level, accuracyTrend);

            // Streak info
            const currentStreak = userLine.streak || 0;

            return {
                lineId,
                topic: userLine.lineId?.ncertText || 'Unknown',
                currentLevel: level,
                isMastered,
                overallAccuracy: Math.round(userLine.overallAccuracy || 0),
                recentAccuracy: Math.round(recentAccuracy),
                totalSessions: userLine.totalSessions || 0,
                currentStreak,

                accuracyTrend: accuracyTrend.slice(-10), // Last 10 sessions
                timeMetrics: {
                    avgTimePerSession: Math.round(avgTime),
                    fastestSession: timeSessions.length > 0 ? Math.min(...timeSessions.map(s => s.timeSpent)) : 0,
                    slowestSession: timeSessions.length > 0 ? Math.max(...timeSessions.map(s => s.timeSpent)) : 0
                },
                masteryForecast,
                recommendations: this.generateRecommendations(userLine, recentAccuracy)
            };

        } catch (error) {
            throw new Error(`Failed to get analytics: ${error.message}`);
        }
    }

    /**
     * Forecast when line will reach mastery (L7)
     */
    static forecastMasteryDate(currentLevel, accuracyTrend) {
        if (currentLevel === 7) {
            return {
                isMastered: true,
                masteredAt: new Date(),
                estimatedDaysRemaining: 0
            };
        }

        // Calculate recent success rate
        const recentSessions = accuracyTrend.slice(-5);
        const successRate = recentSessions.length > 0
            ? recentSessions.filter(s => s.accuracy >= 75).length / recentSessions.length
            : 0;

        // Estimate days to L7
        const levelsRemaining = 7 - currentLevel;
        const daysPerLevel = 3; // Average time between levels
        const estimatedDays = successRate > 0
            ? Math.ceil((levelsRemaining * daysPerLevel) / (successRate || 0.5))
            : levelsRemaining * 5;

        const forecastDate = new Date();
        forecastDate.setDate(forecastDate.getDate() + estimatedDays);

        return {
            isMastered: false,
            forecastDate,
            confidence: successRate > 0.8 ? 'high' : successRate > 0.5 ? 'medium' : 'low',
            estimatedDaysRemaining: estimatedDays
        };
    }

    /**
     * Generate personalized recommendations
     */
    static generateRecommendations(userLine, recentAccuracy) {
        const recommendations = [];

        if (recentAccuracy < 50) {
            recommendations.push({
                type: 'critical',
                text: 'Your recent accuracy is low. Consider reviewing the key concepts.',
                action: 'Review Concepts',
                priority: 1
            });
        } else if (recentAccuracy < 75) {
            recommendations.push({
                type: 'warning',
                text: 'You\'re close to the pass rate. Practice more to advance quickly.',
                action: 'Practice More',
                priority: 2
            });
        }

        if (userLine.streak === 0 && userLine.level > 1) {
            recommendations.push({
                type: 'warning',
                text: 'You just failed a revision. Try again tomorrow after reviewing.',
                action: 'Study Notes',
                priority: 2
            });
        }

        if (recentAccuracy > 85 && userLine.level < 7) {
            recommendations.push({
                type: 'success',
                text: 'Great progress! You\'re on track to advance to the next level soon.',
                action: 'Keep Going',
                priority: 3
            });
        }

        return recommendations.sort((a, b) => a.priority - b.priority);
    }
}

module.exports = NeuronzService;
