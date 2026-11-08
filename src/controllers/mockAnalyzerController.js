const fs = require('fs');
const scorecardQueue = require('../queues/scorecard.queue');
const ScorecardAttempt = require('../models/ScorecardAttempt');
const Question = require('../models/Question');
const Chapter = require('../models/Chapter');

exports.uploadScorecard = async (req, res, next) => {
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
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      await fs.promises.unlink(req.file.path).catch(() => {});
    }
    next(err);
  }
};

exports.getJobStatus = async (req, res, next) => {
  try {
    const { id, jobId } = req.params;
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

exports.getScorecardHistory = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const attempts = await ScorecardAttempt.find({ userId }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: attempts.length,
      data: attempts
    });
  } catch (err) {
    next(err);
  }
};

exports.generateRemediationQuiz = async (req, res, next) => {
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
