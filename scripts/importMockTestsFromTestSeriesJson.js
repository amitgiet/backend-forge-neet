require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MockTest = require('../src/models/MockTest');

const DEFAULT_FILE = path.join(__dirname, '..', 'uploads', 'TestSeries.json');

const coerceStringArray = (value) =>
  Array.isArray(value) ? value.map((v) => String(v)).filter(Boolean) : [];

const coerceNumberArray = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));
};

const toDateOrUndefined = (value) => {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
};

const inferAccessType = (record) => {
  if (record && typeof record.accessType === 'string') {
    const v = record.accessType.toUpperCase().trim();
    if (v === 'FREE' || v === 'PRO' || v === 'ULTIMATE') return v;
  }
  if (record && typeof record.isFree !== 'undefined') {
    const isFree = record.isFree === true || Number(record.isFree) === 1;
    return isFree ? 'FREE' : 'PRO';
  }
  // Default to FREE unless the source explicitly says otherwise
  return 'FREE';
};

const inferOriginalType = (numberOfQuestions) => {
  const n = Number(numberOfQuestions);
  if (Number.isFinite(n) && n > 0 && n < 150) return 'part-test';
  // Most records are 180Q / 180min and should show as "Full Length" in UI
  return 'fulllength-test';
};

const normalizeRecord = (record) => {
  const raw = record && typeof record === 'object' ? record : {};

  const testId = String(raw.testId || raw._id || raw.id || '').trim();
  const title = String(raw.title || raw.name || '').trim();
  if (!testId || !title) return null;

  const seriesType = String(raw.type || raw.seriesType || '').trim();

  const numberOfQuestions = Number(raw.numberOfQuestions);
  const totalQuestions = Number.isFinite(numberOfQuestions) && numberOfQuestions > 0 ? numberOfQuestions : 180;

  const timeLimit = Number(raw.timeLimit);
  const duration = Number.isFinite(timeLimit) && timeLimit > 0 ? timeLimit : 180;

  const unlockDate = toDateOrUndefined(raw.unlockDate);

  const originalTestType = String(raw.originalTestType || inferOriginalType(totalQuestions));

  const taxonomy = {
    subjectNames: coerceStringArray(raw.subjectNames),
    chapterNames: coerceStringArray(raw.chapterNames),
    topicNames: coerceStringArray(raw.topicNames),
    chapterIds: coerceNumberArray(raw.chapterIds),
    chapterTopicsMap: raw.chapterTopicsMap && typeof raw.chapterTopicsMap === 'object' ? raw.chapterTopicsMap : {}
  };

  const questionPdf = raw.questionPaperPdfUrl || raw.questionPdf || '';
  const answerPdf = raw.answerKeyPdfUrl || raw.answerPdf || '';

  const tags = [
    'imported',
    'testseries-json',
    seriesType ? `series:${seriesType.toLowerCase()}` : '',
    taxonomy.subjectNames.length ? `subjects:${taxonomy.subjectNames.length}` : ''
  ].filter(Boolean);

  return {
    testId,
    title: { en: title },
    description: { en: raw.description == null ? '' : String(raw.description) },
    examType: 'NEET_UG',
    testType: 'FULL_TEST',
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
    difficultyDistribution: { easy: 0, medium: 0, hard: 0 },
    accessType: inferAccessType(raw),
    isScheduled: Boolean(unlockDate),
    scheduledAt: unlockDate,
    isActive: raw.isHidden != null ? Number(raw.isHidden) !== 1 : true,
    isLive: false,
    startTime: undefined,
    endTime: undefined,
    tags,
    institution: 'Custom',
    year: undefined,
    classCategory: 'other',
    seriesType,
    taxonomy,
    resources: {
      questionPdf: questionPdf ? String(questionPdf) : '',
      answerPdf: answerPdf ? String(answerPdf) : '',
      hindiQuestionPdf: raw.hindiQuestionPdf ? String(raw.hindiQuestionPdf) : '',
      hindiAnswerPdf: raw.hindiAnswerPdf ? String(raw.hindiAnswerPdf) : '',
      lectures: coerceStringArray(raw.lectures)
    },
    stats: {
      totalAttempts: 0,
      avgScore: 0,
      avgPercentage: 0,
      highestScore: 0,
      lowestScore: 0,
      avgTimeSpent: 0
    },
    source: {
      originalTestType,
      testFor: coerceStringArray(raw.testFor),
      isFree: inferAccessType(raw) === 'FREE',
      isHidden: raw.isHidden != null ? Number(raw.isHidden) === 1 : false,
      index: Number.isFinite(Number(raw.index)) ? Number(raw.index) : undefined,
      raw
    }
  };
};

const extractRecords = (parsed) => {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.testSeries)) return parsed.testSeries;
    if (Array.isArray(parsed.data)) return parsed.data;
  }
  return [];
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

  const rawText = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(rawText);
  const items = extractRecords(parsed);
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('No testSeries records found in input JSON');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
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

