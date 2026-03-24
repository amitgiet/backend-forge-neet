const Test = require('../models/Test');
const TestAttempt = require('../models/TestAttempt');
const Question = require('../models/Question');
const ImportedQuestion = require('../models/ImportedQuestion');
const ImportedCurriculum = require('../models/ImportedCurriculum');
const UserQuestion = require('../models/UserQuestion');
const {
  getPreferredLanguage,
  mapQuestionDocsForLanguage,
} = require('../utils/languagePreference');

// Get all tests with filters
exports.getTests = async (req, res) => {
  try {
    const { type, subject, difficulty, isPremium } = req.query;

    const filter = { isActive: true };
    if (type) filter.type = type;
    if (subject) filter['config.subjects'] = subject;
    if (difficulty) filter['config.difficulty'] = difficulty;
    if (isPremium !== undefined) filter.isPremium = isPremium === 'true';

    const tests = await Test.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, count: tests.length, data: tests });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get test by ID
exports.getTestById = async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }
    res.json({ success: true, data: test });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Start test attempt
exports.startTest = async (req, res) => {
  try {
    const { testId } = req.params;
    const userId = req.user._id;

    const test = await Test.findById(testId).populate('questions');
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    // Check if user has premium access for premium tests
    if (test.isPremium && req.user.subscription?.plan !== 'pro') {
      return res.status(403).json({ message: 'Premium subscription required' });
    }

    const language = getPreferredLanguage(req);

    // Create attempt
    const attempt = new TestAttempt({
      userId,
      testId,
      startedAt: new Date(),
      status: 'in-progress',
      answers: test.questions.map(q => ({
        questionId: q._id,
        selectedOption: null,
        isCorrect: false,
        marksAwarded: 0,
        timeSpent: 0,
        isMarkedForReview: false
      }))
    });

    await attempt.save();

    // Increment attempt count
    test.totalAttempts++;
    await test.save();

    res.json({
      success: true,
      data: {
        attemptId: attempt._id,
        test: {
          _id: test._id,
          title: test.title,
          type: test.type,
          config: test.config,
          questions: mapQuestionDocsForLanguage(test.questions, language)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Save answer (during test)
exports.saveAnswer = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { questionId, selectedOption, timeSpent, isMarkedForReview } = req.body;

    const attempt = await TestAttempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({ message: 'Attempt not found' });
    }

    if (attempt.status !== 'in-progress') {
      return res.status(400).json({ message: 'Test already submitted' });
    }

    // Find and update answer
    const answerIndex = attempt.answers.findIndex(a => a.questionId.toString() === questionId);
    if (answerIndex !== -1) {
      attempt.answers[answerIndex].selectedOption = selectedOption;
      attempt.answers[answerIndex].timeSpent = timeSpent;
      attempt.answers[answerIndex].isMarkedForReview = isMarkedForReview;
      attempt.answers[answerIndex].attemptedAt = new Date();

      await attempt.save();
      res.json({ success: true, message: 'Answer saved' });
    } else {
      res.status(404).json({ message: 'Question not found in attempt' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Submit test
exports.submitTest = async (req, res) => {
  try {
    const { attemptId } = req.params;

    const attempt = await TestAttempt.findById(attemptId).populate({
      path: 'testId',
      populate: { path: 'questions' }
    });

    if (!attempt) {
      return res.status(404).json({ message: 'Attempt not found' });
    }

    if (attempt.status !== 'in-progress') {
      return res.status(400).json({ message: 'Test already submitted' });
    }

    const test = attempt.testId;
    const questions = test.questions;

    // Evaluate answers
    attempt.answers.forEach(answer => {
      const question = questions.find(q => q._id.toString() === answer.questionId.toString());
      if (question && answer.selectedOption) {
        answer.isCorrect = answer.selectedOption === question.correctAnswer;
        answer.marksAwarded = answer.isCorrect ? test.config.marksPerQuestion : (test.config.negativeMarking ? test.config.negativeMarks : 0);
      }
    });

    // Calculate results
    attempt.calculateResults(questions);

    // Calculate rank
    const betterAttempts = await TestAttempt.countDocuments({
      testId: test._id,
      status: 'submitted',
      'results.percentage': { $gt: attempt.results.percentage }
    });
    attempt.results.rank = betterAttempts + 1;

    const totalAttempts = await TestAttempt.countDocuments({
      testId: test._id,
      status: 'submitted'
    });
    attempt.results.percentile = totalAttempts > 0 ? ((totalAttempts - betterAttempts) / totalAttempts) * 100 : 100;

    // Identify weak areas
    attempt.weakAreas = attempt.results.chapterWise
      .filter(ch => ch.accuracy < 60)
      .map(ch => ({
        subject: ch.subject,
        chapter: ch.chapter,
        questionsWrong: ch.incorrect,
        accuracy: ch.accuracy
      }));

    attempt.status = 'submitted';
    attempt.submittedAt = new Date();
    await attempt.save();

    // Feed attempted test questions into NeuronZ (L1 enrollment).
    // Group by source so source metadata remains meaningful.
    const questionsById = new Map(
      (questions || []).map((q) => [String(q._id), q])
    );
    const groupedEnrollments = new Map();

    (attempt.answers || []).forEach((answer) => {
      if (!answer?.selectedOption) return;
      const q = questionsById.get(String(answer.questionId));
      const canonicalQuestionId = String(q?.questionId || '').trim();
      if (!canonicalQuestionId) return;

      const source = {
        subject: q?.subject || null,
        chapterId: q?.chapterId || null,
        topic: q?.topicId || null,
        subTopic: null
      };
      const sourceKey = `${source.subject || ''}|${source.chapterId || ''}|${source.topic || ''}`;
      if (!groupedEnrollments.has(sourceKey)) {
        groupedEnrollments.set(sourceKey, { source, uids: new Set() });
      }
      groupedEnrollments.get(sourceKey).uids.add(canonicalQuestionId);
    });

    if (groupedEnrollments.size > 0) {
      try {
        for (const entry of groupedEnrollments.values()) {
          await UserQuestion.bulkEnroll(
            req.user.id,
            Array.from(entry.uids),
            entry.source
          );
        }
      } catch (enrollErr) {
        console.warn('[submitTest] NeuronZ enroll failed (non-blocking):', enrollErr.message);
      }
    }

    // Update test avg score
    const allAttempts = await TestAttempt.find({ testId: test._id, status: 'submitted' });
    test.avgScore = allAttempts.reduce((sum, a) => sum + a.results.percentage, 0) / allAttempts.length;
    await test.save();

    const attemptObject = attempt.toObject ? attempt.toObject() : attempt;
    const language = getPreferredLanguage(req);
    if (attemptObject?.testId?.questions) {
      attemptObject.testId.questions = mapQuestionDocsForLanguage(attemptObject.testId.questions, language);
    }
    if (Array.isArray(attemptObject?.answers)) {
      attemptObject.answers = attemptObject.answers.map((answer) => ({
        ...answer,
        questionId: answer?.questionId && typeof answer.questionId === 'object'
          ? mapQuestionDocsForLanguage([answer.questionId], language)[0]
          : answer.questionId,
      }));
    }

    res.json({ success: true, data: attemptObject });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get attempt details (for report)
exports.getAttempt = async (req, res) => {
  try {
    const attempt = await TestAttempt.findById(req.params.attemptId)
      .populate({
        path: 'testId',
        populate: { path: 'questions' }
      })
      .populate('answers.questionId');

    if (!attempt) {
      return res.status(404).json({ message: 'Attempt not found' });
    }

    const attemptObject = attempt.toObject ? attempt.toObject() : attempt;
    const language = getPreferredLanguage(req);
    if (attemptObject?.testId?.questions) {
      attemptObject.testId.questions = mapQuestionDocsForLanguage(attemptObject.testId.questions, language);
    }
    if (Array.isArray(attemptObject?.answers)) {
      attemptObject.answers = attemptObject.answers.map((answer) => ({
        ...answer,
        questionId: answer?.questionId && typeof answer.questionId === 'object'
          ? mapQuestionDocsForLanguage([answer.questionId], language)[0]
          : answer.questionId,
      }));
    }

    res.json({ success: true, data: attemptObject });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get user's test history
exports.getUserAttempts = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status } = req.query;

    const filter = { userId };
    if (status) filter.status = status;

    const attempts = await TestAttempt.find(filter)
      .populate('testId')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: attempts.length, data: attempts });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create custom test
exports.createCustomTest = async (req, res) => {
  try {
    const { title, subjects, chapters, subTopics, questionCount, duration, difficulty, ncertOnly } = req.body;
    const questionCountNum = Number(questionCount);
    const durationNum = Number(duration);
    const normalizedSubjects = Array.isArray(subjects)
      ? subjects.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
      : [];
    const selectedChapters = Array.isArray(chapters) ? chapters.map((c) => String(c).trim()).filter(Boolean) : [];
    const selectedSubTopics = new Set(
      (Array.isArray(subTopics) ? subTopics : []).map((s) => String(s).trim()).filter(Boolean)
    );

    if (!Number.isFinite(questionCountNum) || questionCountNum <= 0) {
      return res.status(400).json({ message: 'questionCount must be a positive number' });
    }

    // Build ImportedQuestion filter (this is the same source used by curriculum/subtopic counts)
    const importedFilter = { isActive: { $ne: false } };
    if (normalizedSubjects.length) importedFilter.subject = { $in: normalizedSubjects };
    if (difficulty && difficulty !== 'mixed') importedFilter.difficulty = String(difficulty).toLowerCase();
    // "PYQ Only" should filter only when enabled
    if (ncertOnly === true) importedFilter.isPYQ = true;

    // If chapters are selected, derive exact UID pool from imported curriculum (authoritative mapping)
    if (selectedChapters.length) {
      const chapterDocs = await ImportedCurriculum.find({
        _id: { $in: selectedChapters },
        ...(normalizedSubjects.length ? { subject: { $in: normalizedSubjects } } : {})
      }).lean();

      const uidSet = new Set();
      chapterDocs.forEach((ch) => {
        (ch.topics || []).forEach((t) => {
          (t.sub_topics || []).forEach((st) => {
            if (selectedSubTopics.size > 0 && !selectedSubTopics.has(String(st.subTopic || ''))) return;
            (st.uids || []).forEach((uid) => uidSet.add(String(uid)));
          });
        });
      });

      const uidList = Array.from(uidSet);
      importedFilter.questionId = { $in: uidList };
    }

    // Sample from imported bank using fully aligned filter
    const importedQuestions = await ImportedQuestion.aggregate([
      { $match: importedFilter },
      { $sample: { size: questionCountNum } }
    ]);

    if (importedQuestions.length < questionCountNum) {
      return res.status(400).json({ message: `Only ${importedQuestions.length} questions available` });
    }

    // Ensure sampled imported questions exist in Question collection for Test/TestAttempt flow
    const ensuredQuestions = await Promise.all(importedQuestions.map(async (iq) => {
      const options = ['A', 'B', 'C', 'D'].map((key) => ({
        key,
        text: {
          en: iq?.options?.[key] || '',
          ...(iq?.optionsHi?.[key] ? { hi: iq.optionsHi[key] } : {}),
        },
        isCorrect: iq?.correct_option === key,
      }));

      const doc = await Question.findOneAndUpdate(
        { questionId: String(iq.questionId) },
        {
          $setOnInsert: {
            questionId: String(iq.questionId),
            question: {
              en: String(iq.question || '').trim() || 'Question text unavailable',
              ...(iq?.questionHi ? { hi: String(iq.questionHi).trim() } : {}),
            },
            options,
            correctAnswer: iq?.correct_option || null,
            explanation: {
              en: String(iq.explanation || '').trim() || 'No explanation available.',
              ...(iq?.explanationHi ? { hi: String(iq.explanationHi).trim() } : {}),
            },
            subject: String(iq.subject || '').toLowerCase(),
            chapterId: String(iq.chapterId || selectedChapters[0] || 'unknown'),
            difficulty: ['easy', 'medium', 'hard'].includes(String(iq.difficulty || '').toLowerCase())
              ? String(iq.difficulty).toLowerCase()
              : 'medium',
            isPYQ: !!iq.isPYQ,
            pyqData: {
              year: iq.pyqYear || undefined,
              exam: iq.pyqExam || undefined,
              shift: iq.pyqShift || undefined,
            },
            isActive: true,
            questionType: 'mcq',
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      return doc;
    }));

    // Create test
    const test = new Test({
      title: title || 'Custom Test',
      type: 'custom-part',
      config: {
        duration: Number.isFinite(durationNum) && durationNum > 0 ? durationNum : 45,
        totalQuestions: questionCountNum,
        subjects: normalizedSubjects.map((s) => s.charAt(0).toUpperCase() + s.slice(1)),
        chapters: selectedChapters,
        difficulty,
        ncertOnly: ncertOnly === true,
        negativeMarking: true,
        marksPerQuestion: 4,
        negativeMarks: -1
      },
      questions: ensuredQuestions.map(q => q._id),
      createdBy: 'user'
    });

    await test.save();
    res.json({ success: true, data: test });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = exports;
