require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MockTest = require('../src/models/MockTest');

const DEFAULT_FILE = path.join(__dirname, '..', 'uploads', 'biology.json');

const mapTestType = (value) => {
  const v = String(value || '').toLowerCase().trim();
  if (v === 'full-test' || v === 'fulllength-test') return 'FULL_TEST';
  if (v === 'part-test') return 'CHAPTER_TEST';
  return 'CUSTOM';
};

const inferTotalQuestions = (rawType) => {
  const v = String(rawType || '').toLowerCase().trim();
  if (v === 'part-test') return 90;
  return 180;
};

const inferDurationMinutes = (startTime, endTime, fallback) => {
  const start = Number(startTime);
  const end = Number(endTime);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    const mins = Math.round((end - start) / 60000);
    if (mins > 0 && mins <= 600) return mins;
  }
  return fallback;
};

const parseYearFromTestFor = (testFor = []) => {
  const values = Array.isArray(testFor) ? testFor : [];
  for (const item of values) {
    const m = String(item).match(/(\d{2,4})/);
    if (!m) continue;
    const n = Number(m[1]);
    if (n >= 2000 && n <= 2100) return n;
    if (n >= 20 && n <= 99) return 2000 + n;
  }
  return undefined;
};

const toDateOrUndefined = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return new Date(n);
};

const inferClassCategory = (testFor = []) => {
  const values = Array.isArray(testFor) ? testFor.map((v) => String(v).toLowerCase()) : [];
  const has11 = values.includes('11');
  const has12 = values.includes('12');
  const hasDropper = values.includes('dropper');
  if (hasDropper) return 'dropper';
  if (has11 && has12) return 'mixed';
  if (has11) return '11';
  if (has12) return '12';
  return 'other';
};

const normalizeRecord = (record) => {
  const testId = String(record?._id || '').trim();
  const title = String(record?.name || '').trim();
  if (!testId || !title) return null;

  const totalQuestions = inferTotalQuestions(record.testType);
  const duration = inferDurationMinutes(record.startTime, record.endTime, totalQuestions);
  const startTime = toDateOrUndefined(record.startTime);
  const endTime = toDateOrUndefined(record.endTime);

  const tags = [
    'imported',
    'biology-json',
    String(record.testType || '').toLowerCase(),
    ...(Array.isArray(record.testFor) ? record.testFor.map((v) => `for:${String(v).toLowerCase()}`) : [])
  ].filter(Boolean);

  return {
    testId,
    title: { en: title },
    description: { en: String(record.description || '').trim() },
    examType: 'NEET_UG',
    testType: mapTestType(record.testType),
    config: {
      totalQuestions,
      totalMarks: totalQuestions * 4,
      duration,
      marksPerCorrect: 4,
      marksPerIncorrect: -1,
      marksPerUnattempted: 0,
      sections: []
    },
    questions: [],
    chapterMapping: [],
    difficultyDistribution: {
      easy: 0,
      medium: 0,
      hard: 0
    },
    accessType: Number(record.isFree) === 1 ? 'FREE' : 'PRO',
    isScheduled: Boolean(startTime && endTime),
    scheduledAt: startTime,
    isActive: Number(record.isHidden) !== 1,
    isLive: Boolean(startTime && endTime && Date.now() >= startTime.getTime() && Date.now() <= endTime.getTime()),
    startTime,
    endTime,
    tags,
    institution: 'Custom',
    year: parseYearFromTestFor(record.testFor),
    classCategory: inferClassCategory(record.testFor),
    source: {
      originalTestType: String(record.testType || ''),
      testFor: Array.isArray(record.testFor) ? record.testFor.map((v) => String(v)) : [],
      isFree: Number(record.isFree) === 1,
      isHidden: Number(record.isHidden) === 1,
      index: Number.isFinite(Number(record.index)) ? Number(record.index) : undefined
    },
    resources: {
      questionPdf: record.questionPdf ? String(record.questionPdf) : '',
      answerPdf: record.answerPdf ? String(record.answerPdf) : '',
      hindiQuestionPdf: record.hindiQuestionPdf ? String(record.hindiQuestionPdf) : '',
      hindiAnswerPdf: record.hindiAnswerPdf ? String(record.hindiAnswerPdf) : '',
      lectures: Array.isArray(record.lectures) ? record.lectures.map((v) => String(v)) : []
    },
    stats: {
      totalAttempts: 0,
      avgScore: 0,
      avgPercentage: 0,
      highestScore: 0,
      lowestScore: 0,
      avgTimeSpent: 0
    }
  };
};

async function run() {
  const fileArg = process.argv[2];
  const filePath = fileArg
    ? (path.isAbsolute(fileArg) ? fileArg : path.join(process.cwd(), fileArg))
    : DEFAULT_FILE;

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing in environment');
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Input JSON must be an array');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of parsed) {
    const doc = normalizeRecord(item);
    if (!doc) {
      skipped += 1;
      continue;
    }

    const existing = await MockTest.findOne({ testId: doc.testId }).select('_id');
    if (existing) {
      await MockTest.updateOne({ _id: existing._id }, { $set: doc });
      updated += 1;
    } else {
      await MockTest.create(doc);
      inserted += 1;
    }
  }

  console.log(`Import complete from: ${filePath}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('Import failed:', err.message);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
