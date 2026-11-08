/**
 * applyMemoneetImageR2ToDB.js
 *
 * Reads scripts/memoneet_image_r2_mapping.jsonl and updates MongoDB
 * collections (importedquestions, questions) replacing external Memoneet GCS URLs
 * with our permanent Cloudflare R2 URLs.
 *
 * Usage:
 *   node scripts/applyMemoneetImageR2ToDB.js --dry-run
 *   node scripts/applyMemoneetImageR2ToDB.js --apply
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { MongoClient } = require('mongodb');
require('colors');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const MAPPING_FILE = path.join(__dirname, 'memoneet_image_r2_mapping.jsonl');
const IS_APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 500;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is missing in .env'.red.bold);
  process.exit(1);
}

if (!fs.existsSync(MAPPING_FILE)) {
  console.error(`❌ Mapping file not found: ${MAPPING_FILE}`.red.bold);
  console.error('Run `node scripts/migrateMemoneetImagesToR2.js` first to upload images and generate mapping.'.yellow);
  process.exit(1);
}

async function main() {
  console.log('\n======================================================'.magenta.bold);
  console.log('  R2 IMAGE URL TO MONGODB DATABASE APPLICATOR        '.magenta.bold);
  console.log(`  Mode:         ${IS_APPLY ? '🔥 LIVE APPLY (Updating DB)'.green.bold : '🛡️  DRY RUN (Read-Only Validation)'.cyan.bold}`);
  console.log(`  Mapping File: ${MAPPING_FILE}`);
  console.log('======================================================\n'.magenta.bold);

  console.log('[Step 1]: Loading mapping dictionary into memory...'.white);
  const urlMap = new Map();

  const fileStream = fs.createReadStream(MAPPING_FILE);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.originalUrl && entry.r2Url) {
        urlMap.set(entry.originalUrl.trim(), entry.r2Url.trim());
      }
    } catch (_) {}
  }

  console.log(`✅ Loaded ${urlMap.size} unique URL mappings into memory.\n`.green.bold);

  if (urlMap.size === 0) {
    console.log('⚠️  No valid mappings found in file. Exiting.'.yellow);
    return;
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();
  console.log('✅ Connected to MongoDB Atlas\n'.green);

  const importedQuestionsColl = db.collection('importedquestions');
  const questionsColl = db.collection('questions');

  // --------------------------------------------------------------------------
  // Update importedquestions
  // --------------------------------------------------------------------------
  console.log('--- Scanning `importedquestions` collection ---'.yellow.bold);
  const cursor = importedQuestionsColl.find(
    {
      $or: [
        { imageUrl: { $regex: /storage\.googleapis\.com\/memoneet/i } },
        { explanationImageUrl: { $regex: /storage\.googleapis\.com\/memoneet/i } },
      ],
    },
    { projection: { _id: 1, imageUrl: 1, explanationImageUrl: 1 } }
  );

  let iqMatched = 0;
  let iqModified = 0;
  let iqOps = [];
  const startTime = Date.now();

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    iqMatched++;

    const $set = {};
    if (doc.imageUrl && urlMap.has(doc.imageUrl.trim())) {
      $set.imageUrl = urlMap.get(doc.imageUrl.trim());
    }
    if (doc.explanationImageUrl && urlMap.has(doc.explanationImageUrl.trim())) {
      $set.explanationImageUrl = urlMap.get(doc.explanationImageUrl.trim());
    }

    if (Object.keys($set).length > 0) {
      $set.updatedAt = new Date();
      iqOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set },
        },
      });
    }

    if (iqOps.length >= BATCH_SIZE) {
      if (IS_APPLY) {
        const res = await importedQuestionsColl.bulkWrite(iqOps, { ordered: false });
        iqModified += (res.modifiedCount || 0);
      } else {
        iqModified += iqOps.length;
      }
      iqOps = [];
      process.stdout.write(`\r  ${IS_APPLY ? '[APPLYING]' : '[SIMULATING]'} Processed ${iqMatched} docs | Modified: ${iqModified}`);
    }
  }

  if (iqOps.length > 0) {
    if (IS_APPLY) {
      const res = await importedQuestionsColl.bulkWrite(iqOps, { ordered: false });
      iqModified += (res.modifiedCount || 0);
    } else {
      iqModified += iqOps.length;
    }
    iqOps = [];
  }
  process.stdout.write('\n');

  console.log(`✅ [importedquestions Complete]: Matched: ${iqMatched} | Modified: ${iqModified}\n`.green.bold);

  // --------------------------------------------------------------------------
  // Update questions collection
  // --------------------------------------------------------------------------
  console.log('--- Scanning `questions` collection ---'.yellow.bold);
  const qCursor = questionsColl.find(
    {
      $or: [
        { imageUrl: { $regex: /storage\.googleapis\.com\/memoneet/i } },
        { explanationImageUrl: { $regex: /storage\.googleapis\.com\/memoneet/i } },
        { questionImageUrl: { $regex: /storage\.googleapis\.com\/memoneet/i } },
      ],
    },
    { projection: { _id: 1, imageUrl: 1, explanationImageUrl: 1, questionImageUrl: 1 } }
  );

  let qMatched = 0;
  let qModified = 0;
  let qOps = [];

  while (await qCursor.hasNext()) {
    const doc = await qCursor.next();
    qMatched++;

    const $set = {};
    if (doc.imageUrl && urlMap.has(doc.imageUrl.trim())) {
      $set.imageUrl = urlMap.get(doc.imageUrl.trim());
    }
    if (doc.questionImageUrl && urlMap.has(doc.questionImageUrl.trim())) {
      $set.questionImageUrl = urlMap.get(doc.questionImageUrl.trim());
    }
    if (doc.explanationImageUrl && urlMap.has(doc.explanationImageUrl.trim())) {
      $set.explanationImageUrl = urlMap.get(doc.explanationImageUrl.trim());
    }

    if (Object.keys($set).length > 0) {
      $set.updatedAt = new Date();
      qOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set },
        },
      });
    }

    if (qOps.length >= BATCH_SIZE) {
      if (IS_APPLY) {
        const res = await questionsColl.bulkWrite(qOps, { ordered: false });
        qModified += (res.modifiedCount || 0);
      } else {
        qModified += qOps.length;
      }
      qOps = [];
    }
  }

  if (qOps.length > 0) {
    if (IS_APPLY) {
      const res = await questionsColl.bulkWrite(qOps, { ordered: false });
      qModified += (res.modifiedCount || 0);
    } else {
      qModified += qOps.length;
    }
    qOps = [];
  }

  console.log(`✅ [questions Complete]: Matched: ${qMatched} | Modified: ${qModified}\n`.green.bold);

  await client.close();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('======================================================'.cyan.bold);
  console.log('              DATABASE APPLICATION REPORT            '.cyan.bold);
  console.log('======================================================'.cyan.bold);
  console.log(`Mode:                   ${IS_APPLY ? 'LIVE APPLY' : 'DRY RUN'}`);
  console.log(`Duration:               ${elapsed}s`);
  console.log(`Total Docs Matched:     ${iqMatched + qMatched}`);
  console.log(`Total Docs Updated:     ${iqModified + qModified}`);
  console.log('======================================================\n'.cyan.bold);
}

main().catch((err) => {
  console.error('\n❌ Fatal Applicator Exception:', err);
  process.exit(1);
});
