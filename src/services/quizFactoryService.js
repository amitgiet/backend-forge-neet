const crypto = require('crypto');
const GeminiService = require('./geminiService');
const Question = require('../models/Question');
const Chapter = require('../models/Chapter');
const QuizMeta = require('../models/QuizMeta');

const optionKeys = ['A', 'B', 'C', 'D'];

function safeLower(v) {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

function toSafeRegex(value) {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, 'i');
}

function makeQuestionId(prefix) {
  const rand = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${Date.now()}_${rand}`;
}

async function ensureAIGeneratedChapter(subject) {
  const subjectNorm = safeLower(subject) || 'general';
  const chapterId = `${subjectNorm}_ai_generated`;

  let chapter = await Chapter.findOne({ chapterId }).lean();
  if (chapter) return chapterId;

  // Minimal Chapter record to satisfy Question.chapterId references.
  // Uses NCERT chapterNumber 0 as a sentinel.
  await Chapter.create({
    chapterId,
    name: { en: 'AI Generated', hi: 'AI Generated' },
    subject: subjectNorm === 'general' ? 'physics' : subjectNorm, // Chapter requires enum without 'general'
    ncert: { class: 11, chapterNumber: 0, totalPages: 0, keyTopics: [] },
    tags: ['ai-generated'],
    isActive: true
  });

  return chapterId;
}

async function resolveChapterId({ subject, chapterId, chapterNumber }) {
  const chapterIdNorm = typeof chapterId === 'string' ? chapterId.trim().toLowerCase() : '';
  if (chapterIdNorm) {
    const exists = await Chapter.findOne({ chapterId: chapterIdNorm }).select('chapterId').lean();
    if (exists) return exists.chapterId;
  }

  const subjectNorm = safeLower(subject);
  const chapNum = Number.isFinite(Number(chapterNumber)) ? Number(chapterNumber) : null;
  if (subjectNorm && chapNum !== null) {
    const found = await Chapter.findOne({
      subject: subjectNorm,
      isActive: true,
      'ncert.chapterNumber': chapNum
    })
      .sort({ 'ncert.class': -1 })
      .select('chapterId')
      .lean();
    if (found?.chapterId) return found.chapterId;
  }

  return await ensureAIGeneratedChapter(subjectNorm || 'physics');
}

class QuizFactoryService {
  /**
   * Generate MCQ questions from Gemini and store them as canonical Question docs.
   * Returns created questionIds (Question.questionId).
   */
  static async generateQuestionsWithAI({
    subject,
    chapterId,
    chapterNumber,
    topic,
    count = 5,
    difficulty = 'medium',
    examTypes = ['NEET_UG']
  }) {
    const subjectNorm = safeLower(subject) || 'general';
    const topicText = (typeof topic === 'string' && topic.trim()) ? topic.trim() : `${subjectNorm} practice`;
    const countNum = Math.max(1, Math.min(50, Number(count) || 5));
    const difficultyNorm = ['easy', 'medium', 'hard'].includes(safeLower(difficulty))
      ? safeLower(difficulty)
      : 'medium';

    const resolvedChapterId = await resolveChapterId({ subject: subjectNorm, chapterId, chapterNumber });

    const prompt = `Generate ${countNum} multiple-choice questions for the topic "${topicText}" in ${subjectNorm}.
Difficulty: ${difficultyNorm}

For each question, provide JSON in this exact format:
{
  "question": "Question text here?",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctAnswer": 1,
  "explanation": "Brief explanation of why this is correct"
}

Return ONLY a JSON array with ${countNum} objects. NO other text.
Ensure:
- Options are plausible distractors
- Correct answer index is 0-3
- Explanations are educational
- Questions test conceptual understanding (NCERT-aligned)`;

    const raw = await GeminiService.generateText(prompt, { maxRetries: 2 });
    let parsed = [];
    try {
      const match = raw.match(/\[[\s\S]*\]/);
      parsed = match ? JSON.parse(match[0]) : JSON.parse(raw);
    } catch (e) {
      parsed = [];
    }

    const createdQuestionIds = [];
    for (let i = 0; i < countNum; i++) {
      const item = Array.isArray(parsed) ? parsed[i] : null;
      const questionText = item?.question && typeof item.question === 'string'
        ? item.question.trim()
        : `Question ${i + 1} on ${topicText}?`;
      const options = Array.isArray(item?.options) && item.options.length === 4
        ? item.options.map((o) => String(o))
        : ['Option A', 'Option B', 'Option C', 'Option D'];
      const correctIdx = typeof item?.correctAnswer === 'number' && item.correctAnswer >= 0 && item.correctAnswer <= 3
        ? item.correctAnswer
        : 0;
      const explanation = item?.explanation && typeof item.explanation === 'string'
        ? item.explanation.trim()
        : 'Review the topic to understand the concept better.';

      const questionId = makeQuestionId(`ai_${subjectNorm}_${resolvedChapterId}`);
      const correctKey = optionKeys[correctIdx];

      await Question.create({
        questionId,
        question: { en: questionText },
        options: options.map((text, idx) => ({
          key: optionKeys[idx],
          text: { en: text },
          isCorrect: idx === correctIdx
        })),
        correctAnswer: correctKey,
        explanation: { en: explanation },
        subject: subjectNorm === 'general' ? 'physics' : subjectNorm, // Question requires enum without 'general'
        chapterId: resolvedChapterId,
        topicId: undefined,
        conceptTags: [safeLower(topicText)].filter(Boolean),
        examTypes,
        difficulty: difficultyNorm,
        questionType: 'mcq',
        typeData: {
          options: optionKeys,
          correctIndex: correctIdx
        },
        isPYQ: false,
        ncertReference: {
          class: 11,
          chapter: Number.isFinite(Number(chapterNumber)) ? Number(chapterNumber) : undefined
        },
        isActive: true
      });

      createdQuestionIds.push(questionId);
    }

    return {
      chapterId: resolvedChapterId,
      questionIds: createdQuestionIds
    };
  }

  static async createQuiz({
    ownerUserId,
    title,
    topic,
    subject,
    chapterId,
    topicId,
    source,
    quizType = 'mcq',
    level = 1,
    difficulty = 'mixed',
    questionIds,
    isPublished = true,
    tags = []
  }) {
    const topicText = (typeof topic === 'string' && topic.trim()) ? topic.trim() : 'Practice Quiz';
    const subjectNorm = safeLower(subject) || 'general';
    const ids = Array.isArray(questionIds) ? questionIds.filter(Boolean) : [];

    const doc = await QuizMeta.create({
      ownerUserId,
      title: title || topicText,
      topic: topicText,
      subject: subjectNorm,
      chapterId,
      topicId,
      source: source || 'quiz-generator',
      quizType,
      level,
      difficulty,
      questionIds: ids.map((qid, idx) => ({ questionId: qid, order: idx + 1 })),
      totalQuestions: ids.length,
      isPublished,
      tags: Array.isArray(tags) ? tags : []
    });

    return doc;
  }

  /**
   * Create canonical Question docs from plain MCQ items (no AI call).
   * Items: [{question, options[4], correctAnswer(index 0-3), explanation}]
   */
  static async createQuestionsFromPlain({
    subject,
    chapterId,
    chapterNumber,
    topic,
    items,
    difficulty = 'medium',
    examTypes = ['NEET_UG']
  }) {
    const subjectNorm = safeLower(subject) || 'general';
    const topicText = (typeof topic === 'string' && topic.trim()) ? topic.trim() : `${subjectNorm} practice`;
    const difficultyNorm = ['easy', 'medium', 'hard'].includes(safeLower(difficulty))
      ? safeLower(difficulty)
      : 'medium';

    const resolvedChapterId = await resolveChapterId({ subject: subjectNorm, chapterId, chapterNumber });
    const list = Array.isArray(items) ? items : [];

    const createdQuestionIds = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i] || {};
      const questionText = item.question ? String(item.question).trim() : `Question ${i + 1} on ${topicText}?`;
      const options = Array.isArray(item.options) && item.options.length === 4
        ? item.options.map((o) => String(o))
        : ['Option A', 'Option B', 'Option C', 'Option D'];
      const correctIdx = typeof item.correctAnswer === 'number' && item.correctAnswer >= 0 && item.correctAnswer <= 3
        ? item.correctAnswer
        : 0;
      const explanation = item.explanation ? String(item.explanation).trim() : 'Review the topic to understand the concept better.';

      const questionId = makeQuestionId(`plain_${subjectNorm}_${resolvedChapterId}`);
      const correctKey = optionKeys[correctIdx];

      await Question.create({
        questionId,
        question: { en: questionText },
        options: options.map((text, idx) => ({
          key: optionKeys[idx],
          text: { en: text },
          isCorrect: idx === correctIdx
        })),
        correctAnswer: correctKey,
        explanation: { en: explanation },
        subject: subjectNorm === 'general' ? 'physics' : subjectNorm,
        chapterId: resolvedChapterId,
        topicId: undefined,
        conceptTags: [safeLower(topicText)].filter(Boolean),
        examTypes,
        difficulty: difficultyNorm,
        questionType: 'mcq',
        typeData: {
          options: optionKeys,
          correctIndex: correctIdx
        },
        isPYQ: false,
        ncertReference: {
          class: 11,
          chapter: Number.isFinite(Number(chapterNumber)) ? Number(chapterNumber) : undefined
        },
        isActive: true
      });

      createdQuestionIds.push(questionId);
    }

    return { chapterId: resolvedChapterId, questionIds: createdQuestionIds };
  }

  static async getQuizWithQuestions(quizId) {
    const quiz = await QuizMeta.findById(quizId).lean();
    if (!quiz) return null;

    const ordered = (quiz.questionIds || [])
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((q) => q.questionId);

    const questions = await Question.find({ questionId: { $in: ordered }, isActive: true }).lean();
    const map = new Map(questions.map((q) => [q.questionId, q]));
    const inOrder = ordered.map((qid) => map.get(qid)).filter(Boolean);

    return { quiz, questions: inOrder };
  }

  static async searchQuizzes({ subject, chapterId, topic, limit = 5 }) {
    const subjectNorm = safeLower(subject);
    const topicNorm = typeof topic === 'string' ? topic.trim() : '';
    const limitNum = Math.max(1, Math.min(20, Number(limit) || 5));

    const query = { isPublished: true };
    if (subjectNorm) query.subject = subjectNorm;
    if (chapterId) query.chapterId = String(chapterId).toLowerCase();
    if (topicNorm) {
      const rx = toSafeRegex(topicNorm);
      query.$or = [{ topic: rx }, { title: rx }, { tags: safeLower(topicNorm) }];
    }

    return await QuizMeta.find(query).sort({ createdAt: -1 }).limit(limitNum).lean();
  }
}

module.exports = QuizFactoryService;

