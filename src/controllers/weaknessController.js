const fs = require('fs');
const TestAttempt = require('../models/TestAttempt');
const User = require('../models/User');
const Chapter = require('../models/Chapter');
const Question = require('../models/Question');
const ScorecardAttempt = require('../models/ScorecardAttempt');
const scorecardQueue = require('../queues/scorecard.queue');
const aiAnalysisService = require('../services/aiAnalysisService');

const updateUserProgress = async (userId, mappedData) => {
  const user = await User.findById(userId);
  if (!user) return;
  if (!user.progress) user.progress = [];

  for (const mapping of mappedData.ncertMapping) {
    let progressIndex = user.progress.findIndex(
      p => p.chapterId === mapping.ncertChapterId
    );

    const isWeak = mapping.accuracy < 60;
    const weaknessScore = isWeak ? (100 - mapping.accuracy) : 0;

    if (progressIndex === -1) {
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
        nextRevisionAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        spacedRepetitionInterval: 1
      });
    } else {
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

const calculateChapterTrends = (attempts, subject) => {
  const chapterMap = new Map();

  attempts.forEach(attempt => {
    attempt.chapterAnalysis?.forEach(ch => {
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

// @desc    Upload and analyze mock test PDF / Image via BullMQ background worker
// @route   POST /api/v1/analyze/upload
// @access  Private
const uploadAndAnalyze = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Scorecard file required (PDF, PNG, JPEG, WebP)'
      });
    }

    const userId = req.user._id || req.user.id;
    const attempt = await ScorecardAttempt.create({
      userId,
      source: 'upload',
      processingStatus: 'queued'
    });

    const job = await scorecardQueue.add(
      'scorecard-processing',
      {
        filePath: req.file.path,
        mimeType: req.file.mimetype,
        userId,
        scorecardAttemptId: attempt._id
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
      }
    );

    return res.status(202).json({
      success: true,
      jobId: job.id,
      status: 'processing',
      pollUrl: `/api/v1/analyze/jobs/${job.id}`,
      estimatedTimeMs: 6000
    });
  } catch (error) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      await fs.promises.unlink(req.file.path).catch(() => {});
    }
    next(error);
  }
};

// @desc    Get job status from BullMQ queue
// @route   GET /api/v1/analyze/jobs/:jobId
// @access  Private
const getJobStatus = async (req, res, next) => {
  try {
    const { jobId, id } = req.params;
    const targetId = jobId || id;
    const job = await scorecardQueue.getJob(targetId);

    if (!job) {
      const attempt = await ScorecardAttempt.findById(targetId).catch(() => null);
      if (attempt) {
        return res.status(200).json({
          success: true,
          jobId: targetId,
          status: attempt.processingStatus,
          progress: attempt.processingStatus === 'completed' ? 100 : 0,
          result: {
            extracted: {
              institute: attempt.aiDiagnostic?.institute,
              testName: attempt.testTitle,
              scoreObtained: attempt.scoring?.marksObtained,
              totalMarks: attempt.scoring?.maxMarks,
              accuracyPercentage: attempt.scoring?.percentage,
              sillyMistakesCount: attempt.aiDiagnostic?.sillyMistakesCount || 0,
              subjects: attempt.subjectBreakdown
            },
            scoring: attempt.scoring
          }
        });
      }
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const state = await job.getState();
    const progress = job.progress ?? (state === 'completed' ? 100 : 0);
    const returnValues = job.returnvalue || null;

    return res.status(200).json({
      success: true,
      jobId: job.id,
      status: state,
      progress,
      result: returnValues
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get scorecard upload history
// @route   GET /api/v1/analyze/history
// @access  Private
const getScorecardHistory = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const history = await ScorecardAttempt.find({ userId }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: history.length,
      data: history
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Generate 15-question targeted remediation drill
// @route   POST /api/v1/analyze/remediation-quiz
// @access  Private
const generateRemediationQuiz = async (req, res, next) => {
  try {
    const { weakChapters } = req.body;

    if (!Array.isArray(weakChapters) || weakChapters.length === 0) {
      return res.status(400).json({ success: false, error: 'Weak chapters list required' });
    }

    const matchedChapters = await Chapter.find({
      $or: [
        { chapterId: { $in: weakChapters } },
        { 'name.en': { $in: weakChapters.map(w => new RegExp(`^${w}$`, 'i')) } }
      ]
    }).select('chapterId');
    const matchedIds = matchedChapters.map(c => c.chapterId);
    const searchChapters = Array.from(new Set([...weakChapters, ...matchedIds]));

    let questions = await Question.aggregate([
      {
        $match: {
          $or: [
            { chapterId: { $in: searchChapters } },
            { conceptTags: { $in: weakChapters } }
          ]
        }
      },
      { $sample: { size: 15 } },
      {
        $project: {
          _id: 1,
          questionId: 1,
          question: 1,
          options: 1,
          correctAnswer: 1,
          explanation: 1,
          subject: 1,
          chapterId: 1,
          difficulty: 1
        }
      }
    ]);

    if (questions.length < 15) {
      const remaining = 15 - questions.length;
      const existingIds = questions.map(q => q._id);
      const fallback = await Question.aggregate([
        { $match: { _id: { $nin: existingIds } } },
        { $sample: { size: remaining } },
        {
          $project: {
            _id: 1,
            questionId: 1,
            question: 1,
            options: 1,
            correctAnswer: 1,
            explanation: 1,
            subject: 1,
            chapterId: 1,
            difficulty: 1
          }
        }
      ]);
      questions = [...questions, ...fallback];
    }

    return res.status(200).json({
      success: true,
      count: questions.length,
      quizTitle: 'Scorecard Remediation Drill',
      questions
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get weakness analysis from user history
// @route   GET /api/v1/analyze/weaknesses
// @access  Private
const getWeaknesses = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id || req.user._id);
    if (!user || !user.progress) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: { overall: [], bySubject: { physics: [], chemistry: [], biology: [] }, summary: { totalWeakChapters: 0, physicsWeak: 0, chemistryWeak: 0, biologyWeak: 0 } }
      });
    }

    const weaknesses = user.progress
      .filter(p => p.isWeak)
      .sort((a, b) => b.weaknessScore - a.weaknessScore)
      .slice(0, 10);

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

    const bySubject = {
      physics: weaknessesWithDetails.filter(w => w.subject === 'physics'),
      chemistry: weaknessesWithDetails.filter(w => w.subject === 'chemistry'),
      biology: weaknessesWithDetails.filter(w => w.subject === 'biology')
    };

    return res.status(200).json({
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
const getTargetedQuestions = async (req, res, next) => {
  try {
    const { chapterId } = req.params;
    const limit = parseInt(req.query.limit, 10) || 20;
    const difficulty = req.query.difficulty;

    const filters = {
      isActive: true,
      chapterId
    };

    if (req.user?.primaryExam) {
      filters.examTypes = req.user.primaryExam;
    }

    if (difficulty) {
      filters.difficulty = difficulty;
    }

    const questions = typeof Question.getRandomQuestions === 'function'
      ? await Question.getRandomQuestions(filters, limit)
      : await Question.aggregate([{ $match: filters }, { $sample: { size: limit } }]);

    const chapter = await Chapter.findOne({ chapterId });
    const videoUrl = `https://youtube.com/search?q=NEET+${chapter ? chapter.name.en : chapterId}+explanation`;

    return res.status(200).json({
      success: true,
      count: questions.length,
      data: {
        chapter: chapter ? {
          chapterId: chapter.chapterId,
          name: chapter.name,
          subject: chapter.subject,
          difficulty: chapter.stats?.avgDifficulty
        } : { chapterId },
        questions,
        resources: {
          videoExplanations: videoUrl,
          ncertPages: chapter?.ncert ? `Class ${chapter.ncert.class}, Chapter ${chapter.ncert.chapterNumber}` : null
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
const analyzeTestAttempt = async (req, res, next) => {
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

    const attemptUserId = attempt.userId?._id?.toString() || attempt.userId?.toString();
    const currentUserId = req.user.id || req.user._id?.toString();

    if (attemptUserId !== currentUserId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to access this test attempt'
      });
    }

    let analysis = attempt.insights;

    if (!analysis || Object.keys(analysis).length === 0) {
      const user = await User.findById(currentUserId);
      analysis = await aiAnalysisService.analyzeTestPerformance(attempt, user);

      if (!attempt.insights) attempt.insights = {};
      attempt.insights.strengths = analysis.strengths || [];
      attempt.insights.weaknesses = analysis.topWeaknesses || [];
      attempt.insights.recommendations = analysis.recommendations?.immediate || [];
      await attempt.save();
    }

    const chapterDetails = await Promise.all(
      (attempt.chapterAnalysis || []).map(async (ch) => {
        const chapter = await Chapter.findOne({ chapterId: ch.chapterId });
        return {
          ...(ch._doc || ch),
          chapterName: chapter ? chapter.name : { en: ch.chapterId, hi: ch.chapterId },
          ncertReference: chapter?.ncert ? {
            class: chapter.ncert.class,
            chapterNumber: chapter.ncert.chapterNumber
          } : null
        };
      })
    );

    return res.status(200).json({
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
          chapterWise: chapterDetails.sort((a, b) => (a.accuracy || 0) - (b.accuracy || 0)),
          difficultyWise: attempt.difficultyAnalysis,
          sectionWise: attempt.score?.sections
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
const getWeaknessTrends = async (req, res, next) => {
  try {
    const { subject, timeframe = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(timeframe, 10));

    const query = {
      userId: req.user.id || req.user._id,
      status: 'submitted',
      submittedAt: { $gte: startDate }
    };

    const attempts = await TestAttempt.find(query)
      .sort({ submittedAt: 1 })
      .select('submittedAt score chapterAnalysis');

    const trends = {
      scoreProgression: attempts.map(a => ({
        date: a.submittedAt,
        score: a.score?.marksObtained || 0,
        percentage: a.score?.percentage || 0
      })),

      accuracyProgression: attempts.map(a => {
        const attempted = a.score?.attempted || 0;
        const correct = a.score?.correct || 0;
        return {
          date: a.submittedAt,
          accuracy: attempted > 0 ? Math.round((correct / attempted) * 100) : 0
        };
      }),

      chapterImprovement: calculateChapterTrends(attempts, subject)
    };

    return res.status(200).json({
      success: true,
      data: trends
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadAndAnalyze,
  uploadScorecard: uploadAndAnalyze,
  getJobStatus,
  getScorecardHistory,
  generateRemediationQuiz,
  getWeaknesses,
  getTargetedQuestions,
  analyzeTestAttempt,
  getWeaknessTrends,
  updateUserProgress,
  calculateChapterTrends
};
