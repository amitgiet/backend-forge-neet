require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../src/config/database');

const GeneratedQuiz = require('../src/models/GeneratedQuiz');
const DailyChallenge = require('../src/models/DailyChallenge');
const QuizFactoryService = require('../src/services/quizFactoryService');

async function main() {
  await connectDB();

  const total = await GeneratedQuiz.countDocuments();
  console.log(`[migrate] Found GeneratedQuiz docs: ${total}`);
  if (total === 0) {
    console.log('[migrate] Nothing to migrate.');
    process.exit(0);
  }

  const cursor = GeneratedQuiz.find().cursor();
  const mapping = new Map(); // oldId -> newId

  for await (const gq of cursor) {
    try {
      const subject = String(gq.subject || 'physics').toLowerCase();
      const chapterNumber = gq.chapter ?? undefined;
      const topic = gq.topic || 'Practice Quiz';

      const items = (gq.questions || []).map((q) => ({
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation
      }));

      const { chapterId, questionIds } = await QuizFactoryService.createQuestionsFromPlain({
        subject,
        chapterNumber,
        topic,
        items,
        difficulty: 'medium',
        examTypes: ['NEET_UG']
      });

      const quiz = await QuizFactoryService.createQuiz({
        ownerUserId: gq.userId,
        title: gq.topic,
        topic,
        subject,
        chapterId,
        source: 'quiz-generator',
        quizType: gq.quizType || 'mcq',
        level: gq.level || 1,
        difficulty: 'mixed',
        questionIds,
        isPublished: gq.isPublished !== false,
        tags: Array.isArray(gq.tags) ? gq.tags : []
      });

      mapping.set(String(gq._id), String(quiz._id));
      console.log(`[migrate] ${gq._id} -> ${quiz._id}`);
    } catch (e) {
      console.error(`[migrate] Failed for GeneratedQuiz ${gq._id}:`, e.message);
    }
  }

  // Update DailyChallenge refs if they pointed at GeneratedQuiz ids
  const updates = [];
  for (const [oldId, newId] of mapping.entries()) {
    updates.push({
      updateMany: {
        filter: { quizId: new mongoose.Types.ObjectId(oldId) },
        update: { $set: { quizId: new mongoose.Types.ObjectId(newId) } }
      }
    });
  }

  if (updates.length > 0) {
    const res = await DailyChallenge.bulkWrite(updates, { ordered: false });
    console.log('[migrate] DailyChallenge updates:', res.result || res);
  }

  console.log('[migrate] Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[migrate] Fatal:', err);
  process.exit(1);
});

