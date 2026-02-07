const TestAttempt = require('../models/TestAttempt');
const User = require('../models/User');
const Chapter = require('../models/Chapter');
const pdfParser = require('../utils/pdfParser');
const aiAnalysisService = require('../services/aiAnalysisService');
const path = require('path');

// @desc    Upload and analyze mock test PDF
// @route   POST /api/v1/analyze/upload
// @access  Private
exports.uploadAndAnalyze = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Please upload a PDF file'
            });
        }

        const filePath = req.file.path;

        // Parse PDF
        const parsedData = await pdfParser.parsePDF(filePath);

        if (!parsedData.success) {
            return res.status(400).json({
                success: false,
                error: 'Failed to parse PDF. Please ensure it\'s a valid scorecard.'
            });
        }

        // Map to NCERT chapters
        const mappedData = await pdfParser.mapToNCERTChapters(parsedData.data);

        // Update user progress with weaknesses
        await this.updateUserProgress(req.user.id, mappedData);

        // Get AI analysis
        const user = await User.findById(req.user.id);
        const mockAttempt = {
            score: {
                marksObtained: parsedData.data.totalScore,
                totalMarks: parsedData.data.totalMarks,
                percentage: parsedData.data.percentage,
                totalQuestions: 200, // NEET default
                attempted: 200,
                correct: Math.round(parsedData.data.totalScore / 4) // Assuming 4 marks per question
            },
            chapterAnalysis: mappedData.ncertMapping.map(m => ({
                chapterId: m.ncertChapterId,
                subject: m.subject,
                accuracy: m.accuracy,
                totalQuestions: Math.ceil(m.total / 4),
                correct: Math.ceil(m.score / 4)
            })),
            difficultyAnalysis: {
                easy: { accuracy: parsedData.data.percentage },
                medium: { accuracy: parsedData.data.percentage },
                hard: { accuracy: parsedData.data.percentage }
            }
        };

        const aiAnalysis = await aiAnalysisService.analyzeTestPerformance(mockAttempt, user);

        res.status(200).json({
            success: true,
            data: {
                institution: parsedData.institution,
                score: {
                    total: parsedData.data.totalScore,
                    max: parsedData.data.totalMarks,
                    percentage: parsedData.data.percentage
                },
                subjects: parsedData.data.subjects,
                ncertMapping: mappedData.ncertMapping,
                analysis: aiAnalysis,
                weaknesses: mappedData.ncertMapping
                    .filter(m => m.accuracy < 60)
                    .sort((a, b) => a.accuracy - b.accuracy)
                    .slice(0, 5)
            }
        });

    } catch (error) {
        console.error('Upload and analyze error:', error);
        next(error);
    }
};

// @desc    Get weakness analysis from user history
// @route   GET /api/v1/analyze/weaknesses
// @access  Private
exports.getWeaknesses = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);

        // Get top weaknesses from user progress
        const weaknesses = user.progress
            .filter(p => p.isWeak)
            .sort((a, b) => b.weaknessScore - a.weaknessScore)
            .slice(0, 10);

        // Get chapter details
        const weaknessesWithDetails = await Promise.all(
            weaknesses.map(async (w) => {
                const chapter = await Chapter.findOne({ chapterId: w.chapterId });
                return {
                    chapterId: w.chapterId,
                    chapterName: chapter ? chapter.name : { en: w.chapterId, hi: w.chapterId },
                    subject: w.subject,
                    weaknessScore: w.weaknessScore,
                    accuracy: w.accuracy,
                    mastery: w.mastery,
                    totalAttempted: w.totalAttempted,
                    correctAnswers: w.correctAnswers,
                    lastRevisedAt: w.lastRevisedAt,
                    nextRevisionAt: w.nextRevisionAt,
                    revisionCount: w.revisionCount
                };
            })
        );

        // Group by subject
        const bySubject = {
            physics: weaknessesWithDetails.filter(w => w.subject === 'physics'),
            chemistry: weaknessesWithDetails.filter(w => w.subject === 'chemistry'),
            biology: weaknessesWithDetails.filter(w => w.subject === 'biology')
        };

        res.status(200).json({
            success: true,
            count: weaknessesWithDetails.length,
            data: {
                overall: weaknessesWithDetails,
                bySubject,
                summary: {
                    totalWeakChapters: weaknessesWithDetails.length,
                    physicsWeak: bySubject.physics.length,
                    chemistryWeak: bySubject.chemistry.length,
                    biologyWeak: bySubject.biology.length
                }
            }
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Get targeted questions for weakness
// @route   GET /api/v1/analyze/fix/:chapterId
// @access  Private
exports.getTargetedQuestions = async (req, res, next) => {
    try {
        const { chapterId } = req.params;
        const limit = parseInt(req.query.limit) || 20;
        const difficulty = req.query.difficulty; // 'easy', 'medium', 'hard'

        const Question = require('../models/Question');

        const filters = {
            isActive: true,
            chapterId,
            examTypes: req.user.primaryExam
        };

        if (difficulty) {
            filters.difficulty = difficulty;
        }

        // Get questions
        const questions = await Question.getRandomQuestions(filters, limit);

        // Get chapter details
        const chapter = await Chapter.findOne({ chapterId });

        // Get video explanation URL (placeholder)
        const videoUrl = `https://youtube.com/search?q=NEET+${chapter ? chapter.name.en : chapterId}+explanation`;

        res.status(200).json({
            success: true,
            count: questions.length,
            data: {
                chapter: chapter ? {
                    chapterId: chapter.chapterId,
                    name: chapter.name,
                    subject: chapter.subject,
                    difficulty: chapter.stats.avgDifficulty
                } : { chapterId },
                questions,
                resources: {
                    videoExplanations: videoUrl,
                    ncertPages: chapter ? `Class ${chapter.ncert.class}, Chapter ${chapter.ncert.chapterNumber}` : null
                }
            }
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Analyze specific test attempt
// @route   GET /api/v1/analyze/test/:attemptId
// @access  Private
exports.analyzeTestAttempt = async (req, res, next) => {
    try {
        const { attemptId } = req.params;

        const attempt = await TestAttempt.findById(attemptId)
            .populate('userId')
            .populate({
                path: 'mockTest',
                select: 'title examType config'
            });

        if (!attempt) {
            return res.status(404).json({
                success: false,
                error: 'Test attempt not found'
            });
        }

        // Check ownership
        if (attempt.userId._id.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to access this test attempt'
            });
        }

        // Get AI analysis if not already done
        let analysis = attempt.insights;

        if (!analysis || Object.keys(analysis).length === 0) {
            const user = await User.findById(req.user.id);
            analysis = await aiAnalysisService.analyzeTestPerformance(attempt, user);

            // Update attempt with analysis
            attempt.insights.strengths = analysis.strengths || [];
            attempt.insights.weaknesses = analysis.topWeaknesses || [];
            attempt.insights.recommendations = analysis.recommendations?.immediate || [];
            await attempt.save();
        }

        // Get detailed chapter analysis
        const chapterDetails = await Promise.all(
            attempt.chapterAnalysis.map(async (ch) => {
                const chapter = await Chapter.findOne({ chapterId: ch.chapterId });
                return {
                    ...ch._doc,
                    chapterName: chapter ? chapter.name : { en: ch.chapterId, hi: ch.chapterId },
                    ncertReference: chapter ? {
                        class: chapter.ncert.class,
                        chapterNumber: chapter.ncert.chapterNumber
                    } : null
                };
            })
        );

        res.status(200).json({
            success: true,
            data: {
                attempt: {
                    id: attempt._id,
                    testId: attempt.testId,
                    testTitle: attempt.mockTest?.title,
                    score: attempt.score,
                    submittedAt: attempt.submittedAt,
                    timeSpent: attempt.timeSpent,
                    rank: attempt.rank,
                    percentile: attempt.percentile
                },
                analysis: {
                    overall: analysis,
                    chapterWise: chapterDetails.sort((a, b) => a.accuracy - b.accuracy),
                    difficultyWise: attempt.difficultyAnalysis,
                    sectionWise: attempt.score.sections
                },
                recommendations: {
                    focusChapters: analysis.focusAreas || [],
                    studyStrategy: analysis.studyStrategy || '',
                    nextSteps: analysis.recommendations || {}
                }
            }
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Get weakness trends over time
// @route   GET /api/v1/analyze/trends
// @access  Private
exports.getWeaknessTrends = async (req, res, next) => {
    try {
        const { subject, timeframe = 30 } = req.query; // timeframe in days

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(timeframe));

        const query = {
            userId: req.user.id,
            status: 'COMPLETED',
            submittedAt: { $gte: startDate }
        };

        const attempts = await TestAttempt.find(query)
            .sort({ submittedAt: 1 })
            .select('submittedAt score chapterAnalysis');

        // Analyze trends
        const trends = {
            scoreProgression: attempts.map(a => ({
                date: a.submittedAt,
                score: a.score.marksObtained,
                percentage: a.score.percentage
            })),

            accuracyProgression: attempts.map(a => ({
                date: a.submittedAt,
                accuracy: Math.round((a.score.correct / a.score.attempted) * 100)
            })),

            chapterImprovement: this.calculateChapterTrends(attempts, subject)
        };

        res.status(200).json({
            success: true,
            data: trends
        });

    } catch (error) {
        next(error);
    }
};

// Helper function to update user progress
exports.updateUserProgress = async function (userId, mappedData) {
    const user = await User.findById(userId);

    for (const mapping of mappedData.ncertMapping) {
        // Find or create progress entry
        let progressIndex = user.progress.findIndex(
            p => p.chapterId === mapping.ncertChapterId
        );

        const isWeak = mapping.accuracy < 60;
        const weaknessScore = isWeak ? (100 - mapping.accuracy) : 0;

        if (progressIndex === -1) {
            // Create new progress entry
            user.progress.push({
                chapterId: mapping.ncertChapterId,
                subject: mapping.subject,
                mastery: mapping.accuracy,
                totalAttempted: Math.ceil(mapping.total / 4),
                correctAnswers: Math.ceil(mapping.score / 4),
                accuracy: mapping.accuracy,
                isWeak,
                weaknessScore,
                lastRevisedAt: new Date(),
                nextRevisionAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
                spacedRepetitionInterval: 1
            });
        } else {
            // Update existing progress
            const progress = user.progress[progressIndex];
            progress.mastery = mapping.accuracy;
            progress.accuracy = mapping.accuracy;
            progress.isWeak = isWeak;
            progress.weaknessScore = weaknessScore;
            progress.lastRevisedAt = new Date();
        }
    }

    await user.save();
};

// Helper function to calculate chapter trends
exports.calculateChapterTrends = function (attempts, subject) {
    const chapterMap = new Map();

    attempts.forEach(attempt => {
        attempt.chapterAnalysis.forEach(ch => {
            if (subject && ch.subject !== subject) return;

            if (!chapterMap.has(ch.chapterId)) {
                chapterMap.set(ch.chapterId, []);
            }

            chapterMap.get(ch.chapterId).push({
                date: attempt.submittedAt,
                accuracy: ch.accuracy
            });
        });
    });

    const trends = [];
    chapterMap.forEach((data, chapterId) => {
        if (data.length > 1) {
            const first = data[0].accuracy;
            const last = data[data.length - 1].accuracy;
            const improvement = last - first;

            trends.push({
                chapterId,
                dataPoints: data.length,
                firstAccuracy: first,
                lastAccuracy: last,
                improvement,
                trend: improvement > 0 ? 'improving' : improvement < 0 ? 'declining' : 'stable'
            });
        }
    });

    return trends.sort((a, b) => b.improvement - a.improvement);
};
