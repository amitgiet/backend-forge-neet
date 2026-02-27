const UserLine = require('../models/UserLine');
const NCERTLine = require('../models/NCERTLine');
const SessionAttempt = require('../models/SessionAttempt');
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

    static MOCK_LINE_MARKER = 'This is a mock NCERT line for demonstration purposes.';

    static slugify(value = '') {
        return String(value)
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
    }

    static getTopicLabelFromLine(line = {}) {
        if (Array.isArray(line.conceptTags) && line.conceptTags.length > 0 && line.conceptTags[0]) {
            return String(line.conceptTags[0]).trim();
        }
        if (line.chapter) return `Chapter ${line.chapter}`;
        return 'General';
    }

    static getTopicDescriptor(line = {}) {
        const subject = String(line.subject || 'general').toLowerCase();
        const topic = this.getTopicLabelFromLine(line);
        const topicId = `${subject}__${this.slugify(topic || 'general')}`;
        return { topicId, topic, subject };
    }

    static extractLineIdentifier(value) {
        if (!value) return '';
        if (typeof value === 'string') return value;
        if (typeof value === 'object') {
            if (value._id) return String(value._id);
            if (value.lineId) return String(value.lineId);
        }
        return String(value);
    }

    static async enrichUserLinesWithNCERT(userLines = []) {
        const lineIdentifiers = userLines
            .map((ul) => this.extractLineIdentifier(ul?.lineId))
            .filter(Boolean);
        const objectIdKeys = lineIdentifiers.filter(id => mongoose.Types.ObjectId.isValid(id));
        const businessKeys = lineIdentifiers.filter(id => !mongoose.Types.ObjectId.isValid(id));

        const [byObjectIds, byBusinessIds] = await Promise.all([
            objectIdKeys.length > 0
                ? NCERTLine.find({ _id: { $in: objectIdKeys } }).select('lineId ncertText subject chapter class book conceptTags')
                : [],
            businessKeys.length > 0
                ? NCERTLine.find({ lineId: { $in: businessKeys } }).select('lineId ncertText subject chapter class book conceptTags')
                : []
        ]);

        const lineMap = new Map();
        [...byObjectIds, ...byBusinessIds].forEach(line => {
            lineMap.set(String(line._id), line.toObject());
            lineMap.set(String(line.lineId), line.toObject());
        });

        const enriched = userLines
            .map(ul => {
                const item = ul.toObject ? ul.toObject() : ul;
                const key = this.extractLineIdentifier(item.lineId);
                const matchedLine = lineMap.get(String(key));
                if (!matchedLine) return null;
                if (String(matchedLine.ncertText || '').includes(this.MOCK_LINE_MARKER)) return null;
                item.lineId = matchedLine;
                return item;
            })
            .filter(Boolean);

        // Deduplicate same NCERT line represented by legacy/new lineId format.
        const uniqueLineMap = new Map();
        for (const item of enriched) {
            const key = item.lineId && item.lineId._id ? String(item.lineId._id) : String(item.lineId);
            const existing = uniqueLineMap.get(key);
            if (!existing) {
                uniqueLineMap.set(key, item);
                continue;
            }
            const existingReviewed = new Date(existing.lastReviewed || 0).getTime();
            const currentReviewed = new Date(item.lastReviewed || 0).getTime();
            const shouldReplace =
                (item.level || 0) > (existing.level || 0) ||
                ((item.level || 0) === (existing.level || 0) && currentReviewed > existingReviewed);
            if (shouldReplace) uniqueLineMap.set(key, item);
        }

        return Array.from(uniqueLineMap.values());
    }

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
            const enrichedLines = await this.enrichUserLinesWithNCERT(dueLines);
            const uniqueLines = enrichedLines.sort((a, b) => {
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
    static async processLineSession(userId, lineId, correctAnswers, totalQuizzes = 4, timeSpent = 0, review = null) {
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

            const levelBefore = userLine.level;
            userLine.updateLevel(correctAnswers, totalQuizzes, timeSpent);
            userLine.lineId = canonicalLineId;
            
            // Create SessionAttempt record
            const sessionAttempt = new SessionAttempt({
                userId,
                lineId: canonicalLineId,
                type: 'revision',
                sessionDate: new Date(),
                quizzesAttempted: totalQuizzes,
                correctAnswers,
                accuracy: Math.round((correctAnswers / totalQuizzes) * 100),
                timeSpent,
                levelBefore,
                levelAfter: userLine.level,
                isMastered: userLine.isMastered,
                nextRevision: userLine.nextRevision,
                review: review || []
            });
            
            const savedSession = await sessionAttempt.save();
            userLine.sessionAttemptIds.push(savedSession._id);
            
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
        let ncertLine = null;
        try {
            ncertLine = await this.resolveNCERTLine(lineId);
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
            return this.getMockQuizzes(ncertLine);
        }
    }

    static async getTopicSummary(userId) {
        try {
            const userLines = await UserLine.find({ userId, level: { $gte: 1, $lte: 7 } }).sort({ lastReviewed: -1 });
            const enrichedLines = await this.enrichUserLinesWithNCERT(userLines);
            const now = Date.now();
            const grouped = new Map();

            for (const line of enrichedLines) {
                const descriptor = this.getTopicDescriptor(line.lineId);
                const key = descriptor.topicId;
                const existing = grouped.get(key) || {
                    topicId: descriptor.topicId,
                    topic: descriptor.topic,
                    subject: descriptor.subject,
                    totalTracked: 0,
                    dueNow: 0,
                    masteredCount: 0,
                    byLevel: { L1: 0, L2: 0, L3: 0, L4: 0, L5: 0, L6: 0, L7: 0 },
                    lastActivityAt: null
                };

                existing.totalTracked += 1;
                if (new Date(line.nextRevision).getTime() <= now) existing.dueNow += 1;
                if ((line.level || 0) === 7 || line.isMastered) existing.masteredCount += 1;
                const levelKey = `L${line.level || 1}`;
                if (existing.byLevel[levelKey] !== undefined) existing.byLevel[levelKey] += 1;

                const reviewedAt = line.lastReviewed ? new Date(line.lastReviewed).getTime() : 0;
                const prev = existing.lastActivityAt ? new Date(existing.lastActivityAt).getTime() : 0;
                if (reviewedAt > prev) existing.lastActivityAt = line.lastReviewed;

                grouped.set(key, existing);
            }

            const summary = Array.from(grouped.values())
                .map(item => ({
                    ...item,
                    masteryPercent: item.totalTracked > 0
                        ? Math.round((item.masteredCount / item.totalTracked) * 100)
                        : 0
                }))
                .sort((a, b) => b.dueNow - a.dueNow || a.topic.localeCompare(b.topic));

            return {
                totalTopics: summary.length,
                totalDueNow: summary.reduce((sum, s) => sum + s.dueNow, 0),
                topics: summary
            };
        } catch (error) {
            throw new Error(`Failed to get topic summary: ${error.message}`);
        }
    }

    static async getTopicDueLines(userId, topicId, sessionSize = 6) {
        try {
            const size = Math.max(4, Math.min(10, Number(sessionSize) || 6));
            const dueLines = await UserLine.getDueLines(userId, 500);
            const enrichedLines = await this.enrichUserLinesWithNCERT(dueLines);
            const linesForTopic = enrichedLines
                .filter(line => this.getTopicDescriptor(line.lineId).topicId === String(topicId))
                .sort((a, b) => (a.level || 0) - (b.level || 0) || new Date(a.nextRevision).getTime() - new Date(b.nextRevision).getTime());

            const sample = linesForTopic.slice(0, size);
            const byLevel = { L1: 0, L2: 0, L3: 0, L4: 0, L5: 0, L6: 0, L7: 0 };
            linesForTopic.forEach(line => {
                const levelKey = `L${line.level || 1}`;
                if (byLevel[levelKey] !== undefined) byLevel[levelKey] += 1;
            });

            const first = linesForTopic[0];
            const descriptor = first ? this.getTopicDescriptor(first.lineId) : { topicId, topic: 'Unknown', subject: 'general' };

            return {
                topicId: descriptor.topicId,
                topic: descriptor.topic,
                subject: descriptor.subject,
                dueNow: linesForTopic.length,
                byLevel,
                sessionSize: size,
                lines: sample
            };
        } catch (error) {
            throw new Error(`Failed to get topic due lines: ${error.message}`);
        }
    }

    static async startTopicBaseline(userId, topicId, baselineSize = 20) {
        try {
            const size = Math.max(10, Math.min(30, Number(baselineSize) || 20));
            const userLines = await UserLine.find({ userId, level: { $gte: 1, $lte: 7 } });
            const enrichedLines = await this.enrichUserLinesWithNCERT(userLines);
            const topicLines = enrichedLines
                .filter(line => this.getTopicDescriptor(line.lineId).topicId === String(topicId))
                .sort((a, b) => new Date(a.lastReviewed || 0).getTime() - new Date(b.lastReviewed || 0).getTime());

            const selected = topicLines.slice(0, size);
            return {
                topicId,
                baselineSize: size,
                available: topicLines.length,
                selectedCount: selected.length,
                lines: selected
            };
        } catch (error) {
            throw new Error(`Failed to start topic baseline: ${error.message}`);
        }
    }

    static async getTopicSubmissionHistory(userId, topicId, limit = 20) {
        try {
            const maxItems = Math.max(1, Math.min(100, Number(limit) || 20));
            const userLines = await UserLine.find({ userId, level: { $gte: 1, $lte: 7 } });
            const enrichedLines = await this.enrichUserLinesWithNCERT(userLines);
            const topicLines = enrichedLines.filter(
                (line) => this.getTopicDescriptor(line.lineId).topicId === String(topicId)
            );

            // Get all SessionAttempts for these lines
            const lineIds = topicLines.map(l => String(l.lineId._id));
            const attempts = await SessionAttempt.find({
                userId: new mongoose.Types.ObjectId(userId),
                lineId: { $in: lineIds },
                type: 'revision'
            })
            .sort({ sessionDate: -1 })
            .limit(maxItems);

            const entries = attempts.map(attempt => {
                const line = topicLines.find(l => String(l.lineId._id) === String(attempt.lineId));
                return {
                    lineId: String(attempt.lineId),
                    lineText: String(line?.lineId?.ncertText || 'NCERT line'),
                    subject: String(line?.lineId?.subject || 'general'),
                    chapter: line?.lineId?.chapter || null,
                    sessionDate: attempt.sessionDate,
                    quizzesAttempted: attempt.quizzesAttempted || 0,
                    correctAnswers: attempt.correctAnswers || 0,
                    accuracy: attempt.accuracy || 0,
                    levelAfter: attempt.levelAfter || 1,
                    timeSpent: attempt.timeSpent || 0,
                    isAdjustment: Boolean(attempt.isAdjustment),
                    review: attempt.review || []
                };
            });

            return {
                topicId: String(topicId),
                totalAttempts: entries.length,
                entries
            };
        } catch (error) {
            throw new Error(`Failed to get topic submission history: ${error.message}`);
        }
    }

    /**
     * Fallback mock quizzes if AI service fails
     */
    static getMockQuizzes(ncertLine) {
        const text = String(ncertLine?.ncertText || 'this NCERT line');
        const subject = String(ncertLine?.subject || 'the subject');

        return [
            {
                question: `Which statement best matches this line from ${subject}? "${text}"`,
                options: ['Core definition from the line', 'Unrelated formula', 'Opposite interpretation', 'Historical trivia'],
                correctAnswer: 0,
                explanation: 'The best answer is the core definition/concept directly present in the line.'
            },
            {
                question: `What is the most likely application of this concept?`,
                options: ['Direct NCERT-context application', 'No relation to topic', 'Only lab safety note', 'Only exam strategy'],
                correctAnswer: 0,
                explanation: 'The direct NCERT-context application reflects conceptual understanding.'
            },
            {
                question: `If one key term in the line changes, what changes first?`,
                options: ['Meaning of the concept', 'Chapter title only', 'Subject stream only', 'Nothing changes'],
                correctAnswer: 0,
                explanation: 'Key terminology drives the meaning and interpretation of the concept.'
            },
            {
                question: `What is the safest inference from this line?`,
                options: ['Inference consistent with the NCERT statement', 'Inference that contradicts the line', 'Inference from another chapter', 'No inference possible'],
                correctAnswer: 0,
                explanation: 'A valid inference must stay consistent with the given NCERT statement.'
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
                ncertText: { $not: { $regex: this.MOCK_LINE_MARKER, $options: 'i' } },
                $or: [
                    { ncertText: { $regex: topic, $options: 'i' } },
                    { conceptTags: { $regex: topic, $options: 'i' } }
                ]
            }).limit(100);

            console.log(`[trackBySubjectAndTopic] Found ${ncertLines.length} NCERT lines by topic search`);

            if (!ncertLines || ncertLines.length === 0) {
                const notFoundError = new Error(
                    `No NCERT lines found for "${topic}" in ${subject}. Please add mapped NCERT lines first.`
                );
                notFoundError.statusCode = 404;
                throw notFoundError;
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

    static async getTopicAvailability(subject, topic) {
        try {
            if (!subject || !topic) {
                return {
                    subject: String(subject || '').toLowerCase(),
                    topic: String(topic || ''),
                    available: false,
                    mappedLineCount: 0,
                    sampleLines: []
                };
            }

            const query = {
                subject: { $regex: String(subject), $options: 'i' },
                isActive: true,
                ncertText: { $not: { $regex: this.MOCK_LINE_MARKER, $options: 'i' } },
                $or: [
                    { ncertText: { $regex: String(topic), $options: 'i' } },
                    { conceptTags: { $regex: String(topic), $options: 'i' } }
                ]
            };

            const [mappedLineCount, sampleLines] = await Promise.all([
                NCERTLine.countDocuments(query),
                NCERTLine.find(query)
                    .select('lineId ncertText chapter class pageNumber')
                    .sort({ chapter: 1, pageNumber: 1, lineNumber: 1 })
                    .limit(3)
            ]);

            return {
                subject: String(subject).toLowerCase(),
                topic: String(topic),
                available: mappedLineCount > 0,
                mappedLineCount,
                sampleLines: sampleLines.map((line) => ({
                    lineId: line.lineId,
                    text: line.ncertText,
                    chapter: line.chapter,
                    class: line.class,
                    pageNumber: line.pageNumber
                }))
            };
        } catch (error) {
            throw new Error(`Failed to check topic availability: ${error.message}`);
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

            // Get SessionAttempt records for this line
            const sessions = await SessionAttempt.find({
                userId: new mongoose.Types.ObjectId(userId),
                lineId: String(lineId),
                type: 'revision'
            })
            .sort({ sessionDate: -1 })
            .limit(10);

            // Accuracy trend
            const accuracyTrend = sessions.reverse().map((session, idx) => ({
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
            const timeSessions = sessions.filter(s => s.timeSpent && s.timeSpent > 0);
            const avgTime = timeSessions.length > 0
                ? timeSessions.reduce((sum, s) => sum + s.timeSpent, 0) / timeSessions.length
                : 0;

            // Mastery forecast
            const masteryForecast = this.forecastMasteryDate(userLine.level, accuracyTrend);

            // Streak info
            const currentStreak = userLine.streak || 0;

            return {
                lineId,
                topic: userLine.lineId?.ncertText || 'Unknown',
                currentLevel: userLine.level,
                isMastered: userLine.isMastered,
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
