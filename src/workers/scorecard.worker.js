const { Worker } = require('bullmq');
const fs = require('fs');
const crypto = require('crypto');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const ChapterMastery = require('../models/ChapterMastery');
const ScorecardAttempt = require('../models/ScorecardAttempt');
const User = require('../models/User');
const redisClient = require('../config/redis');

const scorecardResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    institute: { type: SchemaType.STRING, description: 'Coaching institute (Allen, Aakash, Resonance, etc.)' },
    testName: { type: SchemaType.STRING },
    totalMarks: { type: SchemaType.NUMBER },
    scoreObtained: { type: SchemaType.NUMBER },
    accuracyPercentage: { type: SchemaType.NUMBER },
    sillyMistakesCount: { type: SchemaType.NUMBER },
    totalAttempted: { type: SchemaType.NUMBER },
    correctCount: { type: SchemaType.NUMBER },
    incorrectCount: { type: SchemaType.NUMBER },
    unattemptedCount: { type: SchemaType.NUMBER },
    subjects: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          score: { type: SchemaType.NUMBER },
          chapters: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                chapterName: { type: SchemaType.STRING },
                attempted: { type: SchemaType.NUMBER },
                correct: { type: SchemaType.NUMBER },
                incorrect: { type: SchemaType.NUMBER },
                sillyMistakes: { type: SchemaType.NUMBER }
              },
              required: ['chapterName', 'attempted', 'correct', 'incorrect']
            }
          }
        },
        required: ['name', 'score', 'chapters']
      }
    }
  },
  required: ['institute', 'totalMarks', 'scoreObtained', 'accuracyPercentage', 'subjects']
};

const processScorecardJob = async (job) => {
  const { filePath, mimeType, userId, scorecardAttemptId } = job.data;
  await job.updateProgress(10);

  try {
    const fileData = await fs.promises.readFile(filePath);
    const fileHash = crypto.createHash('sha256').update(fileData).digest('hex');
    const base64Content = fileData.toString('base64');
    await job.updateProgress(30);

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'test-key');
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: scorecardResponseSchema
      }
    });

    const prompt = 'Analyze this offline NEET mock test scorecard. Extract institute details, subject totals, question-by-question marks, correct count, incorrect count, and identify silly mistakes vs conceptual errors.';
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: mimeType || 'application/pdf',
          data: base64Content
        }
      }
    ]);

    await job.updateProgress(70);
    const responseText = typeof result.response.text === 'function' ? result.response.text() : result.response.text;
    const parsedData = JSON.parse(responseText);

    const totalAttempted = parsedData.totalAttempted ?? (
      (parsedData.correctCount ?? 0) + (parsedData.incorrectCount ?? 0)
    );
    const correctCount = parsedData.correctCount ?? Math.max(0, Math.round((parsedData.scoreObtained || 0) / 4));
    const incorrectCount = parsedData.incorrectCount ?? Math.max(0, totalAttempted - correctCount);
    const maxMarks = parsedData.totalMarks || 720;
    const unattemptedCount = parsedData.unattemptedCount ?? Math.max(0, Math.round(maxMarks / 4) - totalAttempted);
    const negativeMarksLost = incorrectCount * 1;

    const bulkOps = [];
    const allChapters = [];

    if (Array.isArray(parsedData.subjects)) {
      for (const subj of parsedData.subjects) {
        if (Array.isArray(subj.chapters)) {
          for (const ch of subj.chapters) {
            const attempted = ch.attempted || 0;
            const correct = ch.correct || 0;
            const incorrect = ch.incorrect || 0;
            const silly = ch.sillyMistakes || 0;
            const accuracy = attempted > 0 ? (correct / attempted) * 100 : 0;

            allChapters.push({
              chapterName: ch.chapterName,
              subject: subj.name,
              attempted,
              correct,
              incorrect,
              sillyMistakes: silly,
              accuracy
            });

            if (attempted > 0) {
              bulkOps.push({
                updateOne: {
                  filter: { userId, chapterName: ch.chapterName },
                  update: [
                    {
                      $set: {
                        masteryScore: {
                          $cond: {
                            if: { $eq: [{ $ifNull: ['$masteryScore', null] }, null] },
                            then: accuracy,
                            else: {
                              $add: [
                                { $multiply: [accuracy, 0.3] },
                                { $multiply: ['$masteryScore', 0.7] }
                              ]
                            }
                          }
                        },
                        lastTestedAt: new Date(),
                        subject: subj.name
                      }
                    }
                  ],
                  upsert: true
                }
              });
            }
          }
        }
      }
    }

    if (bulkOps.length > 0) {
      await ChapterMastery.bulkWrite(bulkOps, { ordered: false });
    }

    const user = await User.findById(userId);
    if (user) {
      if (!user.progress) user.progress = [];
      for (const ch of allChapters) {
        if (ch.attempted > 0) {
          const pIndex = user.progress.findIndex(p => p.chapterId === ch.chapterName);
          const isWeak = ch.accuracy < 60;
          const weaknessScore = isWeak ? (100 - ch.accuracy) : 0;

          if (pIndex === -1) {
            user.progress.push({
              chapterId: ch.chapterName,
              subject: ch.subject ? ch.subject.toLowerCase() : 'physics',
              mastery: ch.accuracy,
              totalAttempted: ch.attempted,
              correctAnswers: ch.correct,
              accuracy: ch.accuracy,
              isWeak,
              weaknessScore,
              lastRevisedAt: new Date()
            });
          } else {
            const oldMastery = user.progress[pIndex].mastery || 0;
            const newMastery = (ch.accuracy * 0.3) + (oldMastery * 0.7);
            user.progress[pIndex].mastery = newMastery;
            user.progress[pIndex].accuracy = newMastery;
            user.progress[pIndex].totalAttempted = (user.progress[pIndex].totalAttempted || 0) + ch.attempted;
            user.progress[pIndex].correctAnswers = (user.progress[pIndex].correctAnswers || 0) + ch.correct;
            user.progress[pIndex].isWeak = newMastery < 60;
            user.progress[pIndex].weaknessScore = newMastery < 60 ? (100 - newMastery) : 0;
            user.progress[pIndex].lastRevisedAt = new Date();
          }
        }
      }
      await user.save();
    }

    const payload = {
      fileHash,
      testTitle: parsedData.testName || 'NEET Mock Test',
      scoring: {
        marksObtained: parsedData.scoreObtained,
        maxMarks,
        percentage: parsedData.accuracyPercentage,
        totalAttempted,
        correctCount,
        incorrectCount,
        unattemptedCount,
        negativeMarksLost
      },
      subjectBreakdown: parsedData.subjects,
      chapterAnalysis: allChapters,
      aiDiagnostic: {
        institute: parsedData.institute,
        sillyMistakesCount: parsedData.sillyMistakesCount || 0
      },
      processingStatus: 'completed'
    };

    if (scorecardAttemptId) {
      await ScorecardAttempt.findByIdAndUpdate(scorecardAttemptId, payload);
    } else {
      await ScorecardAttempt.create({
        userId,
        ...payload
      });
    }

    await job.updateProgress(100);

    return {
      success: true,
      extracted: parsedData,
      scoring: payload.scoring,
      analyzedAt: new Date()
    };
  } catch (error) {
    if (scorecardAttemptId) {
      await ScorecardAttempt.findByIdAndUpdate(scorecardAttemptId, {
        processingStatus: 'failed',
        errorMessage: error.message
      }).catch(() => {});
    }
    throw error;
  } finally {
    try {
      if (filePath && fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (cleanupErr) {
      console.error('[Scorecard Worker Disk Cleanup Error]', cleanupErr);
    }
  }
};

const scorecardWorker = new Worker(
  'scorecard-processing',
  processScorecardJob,
  {
    connection: redisClient,
    concurrency: 4
  }
);

module.exports = {
  scorecardWorker,
  processScorecardJob,
  scorecardResponseSchema
};
