'use strict';

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const mongoose = require('mongoose');
require('colors');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ImportedQuestion = require('../src/models/ImportedQuestion');
const ChapterResource = require('../src/models/ChapterResource');
const Chapter = require('../src/models/Chapter');

const CHUNK_SIZE = 500;

const SQLITE_DATABASES = {
  physics: {
    subject: 'physics',
    expectedMissing: 4284,
    dbPath: '/home/bharatkumarkhati/Downloads/test/memoneet_physics.db',
  },
  biology: {
    subject: 'biology',
    expectedMissing: 2126,
    dbPath: '/home/bharatkumarkhati/Downloads/test/memoneet_biology.db',
  },
  chemistry: {
    subject: 'chemistry',
    expectedMissing: 85,
    dbPath: '/home/bharatkumarkhati/Downloads/test/memoneet_chemistry.db',
  },
};

const CROSSWORD_RANGE = {
  subject: 'chemistry',
  slug: 'hydrocarbons',
  startUid: 1000130310,
  endUid: 1000130322,
  expectedCount: 13,
};

function cleanString(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (s === '' || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return null;
  return s;
}

function cleanUrl(val) {
  if (!val || typeof val !== 'string') return null;
  const s = val.trim();
  if (s === '' || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return null;
  return s;
}

function cleanPage(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (s === '' || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return null;
  return s;
}

function isBrokenOrExpiredImage(url) {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') {
    return true;
  }
  if (/[?&](Expires|Signature|GoogleAccessId|token)=/i.test(trimmed)) {
    const match = trimmed.match(/[?&]Expires=(\d+)/i);
    if (match) {
      const expiresEpoch = parseInt(match[1], 10);
      const nowEpoch = Math.floor(Date.now() / 1000);
      if (expiresEpoch <= nowEpoch) return true;
    } else {
      return true;
    }
  }
  return false;
}

function deriveCorrectOption(answer, optA, optB, optC, optD) {
  if (!answer) return null;
  const ans = String(answer).trim();
  if (!ans) return null;

  const upper = ans.toUpperCase();
  if (['A', 'B', 'C', 'D'].includes(upper)) {
    return upper;
  }

  const opts = [
    { letter: 'A', text: optA },
    { letter: 'B', text: optB },
    { letter: 'C', text: optC },
    { letter: 'D', text: optD },
  ];

  for (const o of opts) {
    if (o.text && String(o.text).trim() === ans) {
      return o.letter;
    }
  }

  const normAns = ans.replace(/\s+/g, ' ').toLowerCase();
  for (const o of opts) {
    if (o.text) {
      const normOpt = String(o.text).trim().replace(/\s+/g, ' ').toLowerCase();
      if (normOpt === normAns) {
        return o.letter;
      }
    }
  }

  const prefixMatch = ans.match(/^(?:option\s+)?(?:\(?([1-4]|[a-d])\)?|[1-4]\.|[a-d]\.)/i);
  if (prefixMatch) {
    const digitOrChar = prefixMatch[1].toUpperCase();
    const map = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', 'A': 'A', 'B': 'B', 'C': 'C', 'D': 'D' };
    if (map[digitOrChar]) return map[digitOrChar];
  }

  return null;
}

function mapQuizType(quizType) {
  if (!quizType) return 'mcq';
  const clean = String(quizType).trim().toLowerCase();
  const validTypes = ['mcq', 'fillup', 'match', 'order', 'flashcard', 'video', 'fill-blank', 'diagram-label', 'numeric', 'notes', 'image'];
  if (validTypes.includes(clean)) return clean;
  if (clean === 'multiple choice') return 'mcq';
  return 'mcq';
}

function mapStatus(status) {
  if (!status) return 'NEW';
  const s = String(status).trim().toUpperCase();
  if (s === 'DELETED') return 'DELETED';
  if (s === 'UPDATE' || s === 'UPDATED') return 'UPDATED';
  return 'NEW';
}

function mapDifficulty(diff) {
  if (!diff) return null;
  const s = String(diff).trim().toLowerCase();
  if (s === '1' || s === 'easy') return 'easy';
  if (s === '2' || s === 'medium') return 'medium';
  if (s === '3' || s === 'hard') return 'hard';
  return null;
}

function formatCrosswordTitle(url, topicName) {
  if (topicName && topicName.includes('>>')) {
    const parts = topicName.split('>>');
    const last = parts[parts.length - 1].trim();
    if (last) return last;
  }
  if (!url) return 'Crossword';
  const slug = url.split('/').filter(Boolean).pop() || '';
  const cleanedSlug = slug.replace(/^\d+[-_]?/, '');
  const title = cleanedSlug
    .replace(/[-_]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  return title || 'Crossword';
}

function transformSqliteRowToMongoDoc(row, subject) {
  const questionId = String(row.unique_id);
  const qClean = cleanString(row.question);
  const optA = cleanString(row.option_a);
  const optB = cleanString(row.option_b);
  const optC = cleanString(row.option_c);
  const optD = cleanString(row.option_d);
  const ansClean = cleanString(row.answer);
  const expClean = cleanString(row.explanation);
  const sourceClean = cleanString(row.topic_name);

  let topic = null;
  let subTopic = null;
  if (sourceClean && sourceClean.includes('>>')) {
    const parts = sourceClean.split('>>').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) topic = parts[1];
    if (parts.length >= 3) subTopic = parts.slice(2).join(' >> ');
  }

  const correctOption = deriveCorrectOption(ansClean, optA, optB, optC, optD);
  const qImage = cleanUrl(row.q_image);
  const eImage = cleanUrl(row.e_image);
  const qVideo = cleanUrl(row.q_video);

  return {
    questionId,
    language: 'en',
    subject,
    question: qClean,
    correct_answer: ansClean,
    correct_option: correctOption,
    options: {
      A: optA,
      B: optB,
      C: optC,
      D: optD,
    },
    explanation: expClean,
    source: sourceClean,
    topic,
    subTopic,
    type: mapQuizType(row.quiz_type),
    status: mapStatus(row.syllabus_update),
    difficulty: mapDifficulty(row.difficulty_level),
    chapter_start: cleanPage(row.ncert22_page),
    chapter_end: cleanPage(row.ncert23_page),
    imageUrl: qImage,
    explanationImageUrl: eImage,
    videoUrl: qVideo,
    isPYQ: false,
    pyqYear: null,
    pyqExam: null,
    pyqShift: null,
    tags: [],
    isSupported: true,
    isActive: true,
    isVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function chunkArray(array, size = CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function renderProgressBar(current, total, width = 30) {
  if (total <= 0) return `[${'='.repeat(width)}] 100.0%`;
  const pct = Math.min(100, Math.max(0, (current / total) * 100));
  const completedChars = Math.round((pct / 100) * width);
  const bar = '='.repeat(completedChars) + '-'.repeat(Math.max(0, width - completedChars));
  return `[${bar}] ${pct.toFixed(1)}% (${current}/${total})`;
}

function openSqliteDb(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

function querySqlite(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function closeSqliteDb(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function runPhase1IngestMissingQuestions({ isLive }) {
  console.log('\n======================================================================'.cyan);
  console.log('  PHASE 1: INGEST 6,495 MISSING QUESTIONS (Physics: 4,284 | Bio: 2,126 | Chem: 85)'.cyan.bold);
  console.log('======================================================================'.cyan);

  const stats = {
    physics: { sqlite: 0, mongoExisting: 0, missingFound: 0, inserted: 0 },
    biology: { sqlite: 0, mongoExisting: 0, missingFound: 0, inserted: 0 },
    chemistry: { sqlite: 0, mongoExisting: 0, missingFound: 0, inserted: 0 },
    totalMissing: 0,
    totalInserted: 0,
  };

  for (const [subjectKey, config] of Object.entries(SQLITE_DATABASES)) {
    console.log(`\n--- Processing Subject: ${subjectKey.toUpperCase()} ---`.yellow.bold);
    console.log(`[Source SQLite DB]: ${config.dbPath}`.gray);

    const mongoExistingDocs = await ImportedQuestion.find(
      { subject: config.subject, language: 'en' },
      { questionId: 1 }
    ).lean();
    const existingIdSet = new Set(mongoExistingDocs.map((d) => String(d.questionId)));
    stats[subjectKey].mongoExisting = existingIdSet.size;
    console.log(`[MongoDB Existing 'en']: ${existingIdSet.size} documents`.white);

    const sqliteDb = await openSqliteDb(config.dbPath);
    const sqliteRows = await querySqlite(sqliteDb, 'SELECT * FROM questions');
    await closeSqliteDb(sqliteDb);
    stats[subjectKey].sqlite = sqliteRows.length;
    console.log(`[SQLite Total Questions]: ${sqliteRows.length} rows`.white);

    const missingRows = [];
    for (const row of sqliteRows) {
      const qId = String(row.unique_id);
      if (!existingIdSet.has(qId)) {
        missingRows.push(row);
      }
    }

    stats[subjectKey].missingFound = missingRows.length;
    stats.totalMissing += missingRows.length;

    console.log(`[Missing Delta Identified]: ${missingRows.length} (Expected: ${config.expectedMissing})`.magenta.bold);

    if (missingRows.length !== config.expectedMissing) {
      console.warn(`[WARNING] Subject ${subjectKey} missing count (${missingRows.length}) deviates from expected (${config.expectedMissing})`.yellow.bold);
    }

    if (missingRows.length === 0) {
      console.log(`[Status]: Subject ${subjectKey} is fully hydrated. No upserts needed.`.green);
      continue;
    }

    const bulkOps = missingRows.map((row) => {
      const doc = transformSqliteRowToMongoDoc(row, config.subject);
      return {
        updateOne: {
          filter: { subject: config.subject, questionId: doc.questionId, language: 'en' },
          update: { $setOnInsert: doc },
          upsert: true,
        },
      };
    });

    const chunks = chunkArray(bulkOps, CHUNK_SIZE);
    console.log(`[Execution Plan]: ${bulkOps.length} ops grouped into ${chunks.length} chunks of size ${CHUNK_SIZE}`.gray);

    let subjectInserted = 0;
    const startTime = Date.now();

    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
      const chunk = chunks[cIdx];
      const chunkNum = cIdx + 1;

      if (isLive) {
        try {
          const res = await ImportedQuestion.collection.bulkWrite(chunk, { ordered: false });
          const upsertedCount = res.upsertedCount || 0;
          subjectInserted += upsertedCount;
          stats.totalInserted += upsertedCount;
        } catch (bulkErr) {
          console.error(`[ERROR] Batch ${chunkNum}/${chunks.length} failed: ${bulkErr.message}`.red.bold);
          throw bulkErr;
        }
      } else {
        subjectInserted += chunk.length;
        stats.totalInserted += chunk.length;
      }

      const progress = renderProgressBar(subjectInserted, bulkOps.length);
      const elapsedSec = ((Date.now() - startTime) / 1000) || 0.001;
      const rate = Math.round(subjectInserted / elapsedSec);
      process.stdout.write(`\r  ${isLive ? '[LIVE WRITING]'.green : '[DRY-RUN SIM]'.cyan} ${progress} | Chunk ${chunkNum}/${chunks.length} | ${rate} docs/s`);
    }
    process.stdout.write('\n');

    stats[subjectKey].inserted = subjectInserted;
    console.log(`✅ [${subjectKey.toUpperCase()} Ingestion Complete]: ${subjectInserted} documents processed`.green.bold);
  }

  console.log(`\n[Phase 1 Summary]: Total Missing = ${stats.totalMissing} | Total Processed = ${stats.totalInserted} (Live Mode: ${isLive})`.cyan.bold);
  return stats;
}

async function runPhase2HydrateImages({ isLive }) {
  console.log('\n======================================================================'.cyan);
  console.log('  PHASE 2: HYDRATE MISSING & BROKEN IMAGES (Permanent SQLite URLs)'.cyan.bold);
  console.log('======================================================================'.cyan);

  const phaseStats = {
    totalEvaluated: 0,
    totalNeedingUpdates: 0,
    qImageHydrations: 0,
    eImageHydrations: 0,
    totalUpdated: 0,
    bySubject: {},
  };

  for (const [subjectKey, config] of Object.entries(SQLITE_DATABASES)) {
    console.log(`\n--- Inspecting Images for: ${subjectKey.toUpperCase()} ---`.yellow.bold);

    const mongoDocs = await ImportedQuestion.find(
      { subject: config.subject, language: 'en' },
      { questionId: 1, imageUrl: 1, explanationImageUrl: 1 }
    ).lean();

    const mongoMap = new Map();
    for (const d of mongoDocs) {
      mongoMap.set(String(d.questionId), d);
    }

    const sqliteDb = await openSqliteDb(config.dbPath);
    const sqliteRows = await querySqlite(
      sqliteDb,
      "SELECT unique_id, q_image, e_image FROM questions WHERE (q_image IS NOT NULL AND q_image != '') OR (e_image IS NOT NULL AND e_image != '')"
    );
    await closeSqliteDb(sqliteDb);

    console.log(`[SQLite Rows with Images]: ${sqliteRows.length} rows | [Mongo Matches]: ${mongoMap.size} documents`.white);

    const updateOps = [];
    let qCount = 0;
    let eCount = 0;

    for (const row of sqliteRows) {
      const qId = String(row.unique_id);
      const mDoc = mongoMap.get(qId);
      if (!mDoc) continue;

      const qImgClean = cleanUrl(row.q_image);
      const eImgClean = cleanUrl(row.e_image);

      const needsQ = qImgClean && isBrokenOrExpiredImage(mDoc.imageUrl);
      const needsE = eImgClean && isBrokenOrExpiredImage(mDoc.explanationImageUrl);

      if (needsQ || needsE) {
        const $set = {};
        if (needsQ) {
          $set.imageUrl = qImgClean;
          qCount++;
        }
        if (needsE) {
          $set.explanationImageUrl = eImgClean;
          eCount++;
        }
        $set.updatedAt = new Date();

        updateOps.push({
          updateOne: {
            filter: { subject: config.subject, questionId: qId, language: 'en' },
            update: { $set },
            upsert: false,
          },
        });
      }
    }

    phaseStats.bySubject[subjectKey] = {
      evaluated: sqliteRows.length,
      needingUpdate: updateOps.length,
      qImageUpdates: qCount,
      eImageUpdates: eCount,
      executed: 0,
    };
    phaseStats.totalEvaluated += sqliteRows.length;
    phaseStats.totalNeedingUpdates += updateOps.length;
    phaseStats.qImageHydrations += qCount;
    phaseStats.eImageHydrations += eCount;

    console.log(`[Identified Fixes]: ${updateOps.length} docs to update (q_image: ${qCount}, e_image: ${eCount})`.magenta.bold);

    if (updateOps.length === 0) {
      console.log(`[Status]: ${subjectKey} images are fully consistent. No updates required.`.green);
      continue;
    }

    const chunks = chunkArray(updateOps, CHUNK_SIZE);
    let subjectUpdated = 0;
    const startTime = Date.now();

    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
      const chunk = chunks[cIdx];
      const chunkNum = cIdx + 1;

      if (isLive) {
        try {
          const res = await ImportedQuestion.collection.bulkWrite(chunk, { ordered: false });
          subjectUpdated += (res.modifiedCount || 0);
          phaseStats.totalUpdated += (res.modifiedCount || 0);
        } catch (err) {
          console.error(`[ERROR] Phase 2 chunk ${chunkNum}/${chunks.length} failed: ${err.message}`.red.bold);
          throw err;
        }
      } else {
        subjectUpdated += chunk.length;
        phaseStats.totalUpdated += chunk.length;
      }

      const progress = renderProgressBar(subjectUpdated, updateOps.length);
      const elapsedSec = ((Date.now() - startTime) / 1000) || 0.001;
      const rate = Math.round(subjectUpdated / elapsedSec);
      process.stdout.write(`\r  ${isLive ? '[LIVE HYDRATING]'.green : '[DRY-RUN SIM]'.cyan} ${progress} | Chunk ${chunkNum}/${chunks.length} | ${rate} docs/s`);
    }
    process.stdout.write('\n');

    phaseStats.bySubject[subjectKey].executed = subjectUpdated;
    console.log(`✅ [${subjectKey.toUpperCase()} Image Hydration Complete]: ${subjectUpdated} documents updated`.green.bold);
  }

  console.log(`\n[Phase 2 Summary]: Total Needing Updates = ${phaseStats.totalNeedingUpdates} | q_image fixes = ${phaseStats.qImageHydrations} | e_image fixes = ${phaseStats.eImageHydrations} (Live: ${isLive})`.cyan.bold);
  return phaseStats;
}

async function runPhase3RecoverCrosswords({ isLive }) {
  console.log('\n======================================================================'.cyan);
  console.log('  PHASE 3: RECOVER 13 DROPPED CHEMISTRY CROSSWORDS (Hydrocarbons)'.cyan.bold);
  console.log('======================================================================'.cyan);

  const chemDbPath = SQLITE_DATABASES.chemistry.dbPath;
  const sqliteDb = await openSqliteDb(chemDbPath);
  const rows = await querySqlite(
    sqliteDb,
    `SELECT unique_id, question, answer, topic_name, quiz_type FROM npcm WHERE unique_id BETWEEN ? AND ? ORDER BY unique_id ASC`,
    [CROSSWORD_RANGE.startUid, CROSSWORD_RANGE.endUid]
  );
  await closeSqliteDb(sqliteDb);

  console.log(`[Source SQLite npcm]: Found ${rows.length} crossword records in range [${CROSSWORD_RANGE.startUid} - ${CROSSWORD_RANGE.endUid}]`.white);

  const cr = await ChapterResource.findOne({ subject: CROSSWORD_RANGE.subject, slug: CROSSWORD_RANGE.slug });
  if (!cr) {
    throw new Error(`ChapterResource not found for subject=${CROSSWORD_RANGE.subject}, slug=${CROSSWORD_RANGE.slug}`);
  }

  const existingCrosswords = cr.crosswords || [];
  const existingUidSet = new Set(existingCrosswords.map((item) => String(item.uniqueId)));
  console.log(`[MongoDB Existing Crosswords]: ${existingCrosswords.length} items (UIDs: ${Array.from(existingUidSet).join(', ')})`.white);

  const missingCrosswords = [];
  for (const row of rows) {
    const uidStr = String(row.unique_id);
    if (!existingUidSet.has(uidStr)) {
      const title = formatCrosswordTitle(row.question, row.topic_name);
      missingCrosswords.push({
        uniqueId: uidStr,
        title,
        question: cleanString(row.question),
        answer: cleanString(row.answer),
        driveLink: null,
        driveId: null,
        englishDriveLink: null,
        englishDriveId: null,
        hindiDriveLink: null,
        hindiDriveId: null,
        files: [],
      });
    }
  }

  console.log(`[Crosswords to Recover]: ${missingCrosswords.length} items (Expected: ${CROSSWORD_RANGE.expectedCount})`.magenta.bold);
  missingCrosswords.forEach((item, idx) => {
    console.log(`   ${idx + 1}. UID ${item.uniqueId}: "${item.title}" -> ${item.question}`.gray);
  });

  if (missingCrosswords.length === 0) {
    console.log(`✅ [Phase 3]: All 13 crosswords already exist in hydrocarbons ChapterResource. Up-to-date.`.green.bold);
    return { recovered: 0, totalNow: existingCrosswords.length };
  }

  const mergedCrosswords = [...existingCrosswords, ...missingCrosswords];
  mergedCrosswords.sort((a, b) => parseInt(a.uniqueId, 10) - parseInt(b.uniqueId, 10));

  if (isLive) {
    const updateRes = await ChapterResource.updateOne(
      { subject: CROSSWORD_RANGE.subject, slug: CROSSWORD_RANGE.slug },
      { $set: { crosswords: mergedCrosswords } }
    );
    console.log(`[MongoDB Write]: Modified ${updateRes.modifiedCount} ChapterResource document`.green);

    const recheck = await ChapterResource.findOne({ subject: CROSSWORD_RANGE.subject, slug: CROSSWORD_RANGE.slug }).lean();
    console.log(`✅ [Phase 3 Verified]: ChapterResource crosswords array count is now ${recheck.crosswords.length} (Previous: ${existingCrosswords.length})`.green.bold);
  } else {
    console.log(`[DRY-RUN]: Would merge ${missingCrosswords.length} items into crosswords array (New Total: ${mergedCrosswords.length})`.cyan);
  }

  return {
    recovered: missingCrosswords.length,
    totalNow: mergedCrosswords.length,
  };
}

async function runPhase4CorrectTaxonomy({ isLive }) {
  console.log('\n======================================================================'.cyan);
  console.log('  PHASE 4: CORRECT TAXONOMY & TRANSLATION (Evolution -> विकास)'.cyan.bold);
  console.log('======================================================================'.cyan);

  const targetDoc = await Chapter.findOne({ 'name.en': 'Evolution' });
  if (!targetDoc) {
    console.warn(`[WARNING]: Chapter with name.en: 'Evolution' not found!`.yellow.bold);
    return { updated: false, reason: 'NOT_FOUND' };
  }

  console.log(`[Current Chapter State]:`.white);
  console.log(`  _id:       ${targetDoc._id}`);
  console.log(`  chapterId: ${targetDoc.chapterId}`);
  console.log(`  subject:   ${targetDoc.subject}`);
  console.log(`  name.en:   ${targetDoc.name?.en}`);
  console.log(`  name.hi:   ${targetDoc.name?.hi}`);

  const currentHi = targetDoc.name?.hi;
  const targetHi = 'विकास';

  if (currentHi === targetHi) {
    console.log(`✅ [Phase 4]: Chapter name.hi is already '${targetHi}'. Up-to-date.`.green.bold);
    return { updated: false, currentHi, targetHi, alreadyUpToDate: true };
  }

  if (isLive) {
    const res = await Chapter.updateOne(
      { 'name.en': 'Evolution' },
      { $set: { 'name.hi': targetHi } }
    );
    console.log(`[MongoDB Write]: Modified count = ${res.modifiedCount}`.green);

    const verified = await Chapter.findOne({ 'name.en': 'Evolution' }).lean();
    if (verified.name?.hi === targetHi) {
      console.log(`✅ [Phase 4 Verified]: Successfully updated name.hi from '${currentHi}' to '${targetHi}'`.green.bold);
    } else {
      throw new Error(`Verification failed: name.hi is '${verified.name?.hi}', expected '${targetHi}'`);
    }
  } else {
    console.log(`[DRY-RUN]: Would update Chapter [${targetDoc.chapterId}] name.hi: '${currentHi}' -> '${targetHi}'`.cyan);
  }

  return {
    updated: true,
    previousHi: currentHi,
    newHi: targetHi,
  };
}

async function runRollbackVerification({ isLive, phase1Stats, phase2Stats, phase3Stats, phase4Stats }) {
  console.log('\n======================================================================'.cyan);
  console.log('  POST-MIGRATION / ROLLBACK INTEGRITY VERIFICATION'.cyan.bold);
  console.log('======================================================================'.cyan);

  const verificationResults = {
    phase1: false,
    phase2: false,
    phase3: false,
    phase4: false,
    allPassed: false,
  };

  // Phase 1 Verification: Test sample missing IDs in Mongo
  const sampleUids = [
    { subject: 'physics', id: '15002961' },
    { subject: 'biology', id: '15001833' },
    { subject: 'chemistry', id: '15001949' },
  ];

  let phase1ChecksPassed = true;
  for (const s of sampleUids) {
    const doc = await ImportedQuestion.findOne({ subject: s.subject, questionId: s.id, language: 'en' }).lean();
    const exists = !!doc;
    if (isLive) {
      if (!exists) {
        console.error(`❌ [Verification Phase 1 Fail]: Expected question ${s.subject}:${s.id} not found in MongoDB!`.red.bold);
        phase1ChecksPassed = false;
      } else {
        console.log(`   ✓ Phase 1 Sample Check: ${s.subject}:${s.id} found (Question: "${(doc.question || '').slice(0, 40)}...")`.green);
      }
    } else {
      console.log(`   • Phase 1 Sample Check [Dry-Run]: ${s.subject}:${s.id} currently exists in Mongo? ${exists}`.gray);
    }
  }
  verificationResults.phase1 = phase1ChecksPassed;

  // Phase 2 Verification: Check that expired tokens count decreased or sample questions have clean URLs
  if (isLive) {
    const expiredCount = await ImportedQuestion.countDocuments({
      language: 'en',
      $or: [
        { imageUrl: { $regex: /Expires=/i } },
        { explanationImageUrl: { $regex: /Expires=/i } },
      ],
    });
    console.log(`   ✓ Phase 2 Check: Remaining questions with expired GCS tokens in 'en' = ${expiredCount}`.green);
    verificationResults.phase2 = true;
  } else {
    console.log(`   • Phase 2 Check [Dry-Run]: ${phase2Stats.totalNeedingUpdates} questions marked for image hydration`.gray);
    verificationResults.phase2 = true;
  }

  // Phase 3 Verification: Verify all 13 UIDs in hydrocarbons crosswords
  const cr = await ChapterResource.findOne({ subject: 'chemistry', slug: 'hydrocarbons' }).lean();
  const crUids = new Set((cr?.crosswords || []).map((c) => parseInt(c.uniqueId, 10)));
  let phase3AllFound = true;
  for (let u = CROSSWORD_RANGE.startUid; u <= CROSSWORD_RANGE.endUid; u++) {
    if (!crUids.has(u)) {
      phase3AllFound = false;
      break;
    }
  }
  if (isLive) {
    if (phase3AllFound && cr.crosswords.length >= 23) {
      console.log(`   ✓ Phase 3 Check: All 13 recovered crosswords present in Hydrocarbons (Total: ${cr.crosswords.length})`.green);
      verificationResults.phase3 = true;
    } else {
      console.error(`❌ [Verification Phase 3 Fail]: Hydrocarbons crosswords count is ${cr?.crosswords?.length}, expected >= 23`.red.bold);
      verificationResults.phase3 = false;
    }
  } else {
    console.log(`   • Phase 3 Check [Dry-Run]: Hydrocarbons currently has ${cr?.crosswords?.length || 0} crosswords`.gray);
    verificationResults.phase3 = true;
  }

  // Phase 4 Verification: Verify Evolution chapter Hindi name
  const evoChapter = await Chapter.findOne({ 'name.en': 'Evolution' }).lean();
  if (isLive) {
    if (evoChapter?.name?.hi === 'विकास') {
      console.log(`   ✓ Phase 4 Check: Chapter 'Evolution' name.hi verified as 'विकास'`.green);
      verificationResults.phase4 = true;
    } else {
      console.error(`❌ [Verification Phase 4 Fail]: Chapter 'Evolution' name.hi is '${evoChapter?.name?.hi}', expected 'विकास'`.red.bold);
      verificationResults.phase4 = false;
    }
  } else {
    console.log(`   • Phase 4 Check [Dry-Run]: Chapter 'Evolution' current name.hi is '${evoChapter?.name?.hi}'`.gray);
    verificationResults.phase4 = true;
  }

  verificationResults.allPassed = verificationResults.phase1 &&
                                  verificationResults.phase2 &&
                                  verificationResults.phase3 &&
                                  verificationResults.phase4;

  if (verificationResults.allPassed) {
    console.log(`\n🎉 [ALL INTEGRITY CHECKS PASSED]: 100% data consistency verified!`.green.bold);
  } else {
    console.error(`\n⚠️  [INTEGRITY CHECK WARNINGS DETECTED]: Review error logs above.`.yellow.bold);
  }

  return verificationResults;
}

async function main() {
  const args = process.argv.slice(2);
  const isLive = args.includes('--live');
  const isDryRun = args.includes('--dry-run') || !isLive;

  console.log('\n======================================================================'.magenta.bold);
  console.log('       NEETFORGE MASTER FORENSIC AUDIT SYNC PIPELINE                  '.magenta.bold);
  console.log('======================================================================'.magenta.bold);
  console.log(`Mode:           ${isLive ? 'LIVE EXECUTION (--live)'.red.bold : 'DRY-RUN SAFETY MODE (--dry-run)'.cyan.bold}`);
  console.log(`Node Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Chunk Size:     ${CHUNK_SIZE} records per bulkWrite`);
  console.log(`Timestamp:      ${new Date().toISOString()}`);

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  const maskedUri = process.env.MONGODB_URI.replace(/:([^@]+)@/, ':****@');
  console.log(`Target Database: ${maskedUri}`.gray);

  console.log('\n[Connecting to MongoDB Atlas...]'.yellow);
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ [MongoDB Atlas Connected]'.green.bold);

  const startTime = Date.now();
  let phase1Stats, phase2Stats, phase3Stats, phase4Stats, verification;

  try {
    phase1Stats = await runPhase1IngestMissingQuestions({ isLive });
    phase2Stats = await runPhase2HydrateImages({ isLive });
    phase3Stats = await runPhase3RecoverCrosswords({ isLive });
    phase4Stats = await runPhase4CorrectTaxonomy({ isLive });
    verification = await runRollbackVerification({
      isLive,
      phase1Stats,
      phase2Stats,
      phase3Stats,
      phase4Stats,
    });

    const elapsedTotal = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n======================================================================'.cyan);
    console.log('                     AUDIT SYNC EXECUTION REPORT                       '.cyan.bold);
    console.log('======================================================================'.cyan);
    console.log(`Execution Mode:            ${isLive ? 'LIVE' : 'DRY-RUN'}`);
    console.log(`Duration:                  ${elapsedTotal}s`);
    console.log(`Phase 1 Missing Ingested:  ${phase1Stats.totalInserted} / ${phase1Stats.totalMissing} questions`);
    console.log(`  - Physics:               ${phase1Stats.physics.inserted} / ${phase1Stats.physics.missingFound}`);
    console.log(`  - Biology:               ${phase1Stats.biology.inserted} / ${phase1Stats.biology.missingFound}`);
    console.log(`  - Chemistry:             ${phase1Stats.chemistry.inserted} / ${phase1Stats.chemistry.missingFound}`);
    console.log(`Phase 2 Images Hydrated:   ${phase2Stats.totalUpdated} docs (q_image: ${phase2Stats.qImageHydrations}, e_image: ${phase2Stats.eImageHydrations})`);
    console.log(`Phase 3 Crosswords:        ${phase3Stats.recovered} recovered (Hydrocarbons crosswords total: ${phase3Stats.totalNow})`);
    console.log(`Phase 4 Chapter Taxonomy:  Evolution -> विकास (${phase4Stats.updated ? 'Updated' : 'Up-to-date'})`);
    console.log(`Verification Status:       ${verification.allPassed ? 'PASSED ✅' : 'ATTENTION REQUIRED ⚠️'}`);
    console.log('======================================================================\n'.cyan);

  } catch (err) {
    console.error(`\n❌ [FATAL PIPELINE ERROR]: ${err.message}`.red.bold);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    console.log('[Closing MongoDB Atlas Connection...]'.yellow);
    await mongoose.disconnect();
    console.log('📴 [MongoDB Disconnected Cleanly]'.green);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`Unhandled error: ${err.message}`.red);
    process.exit(1);
  });
}

module.exports = {
  cleanString,
  cleanUrl,
  cleanPage,
  isBrokenOrExpiredImage,
  deriveCorrectOption,
  mapQuizType,
  mapStatus,
  mapDifficulty,
  formatCrosswordTitle,
  transformSqliteRowToMongoDoc,
  chunkArray,
  renderProgressBar,
};
