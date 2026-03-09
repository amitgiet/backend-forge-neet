/**
 * scripts/backfillQuestionSubject.js
 * -----------------------------------
 * Reads every document in `importedcurriculum`, walks the nested
 *   topics[].sub_topics[].uids[]
 * array to build a mapping of  questionId (uid) → subject, then
 * bulk-writes that subject field into every matching `importedquestions`
 * document.
 *
 * Usage:
 *   node scripts/backfillQuestionSubject.js
 *
 * Optional env flags:
 *   DRY_RUN=true   – builds the map and prints stats but skips DB writes
 *   BATCH_SIZE=500  – how many bulkWrite ops to flush at once (default 500)
 *
 * Safe to re-run – uses $set so it will just overwrite the same value.
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');

const ImportedCurriculum = require('../src/models/ImportedCurriculum');
const ImportedQuestion = require('../src/models/ImportedQuestion');

// ── Config ────────────────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;
const DRY_RUN = process.env.DRY_RUN === 'true';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '500', 10);

// ── Step 1: build uid → subject map from importedcurriculum ──────────────────
async function buildSubjectMap() {
    console.log('📖  Reading importedcurriculum …');

    // Only pull the fields we need – skip topics.sub_topics.uids' siblings
    const curricula = await ImportedCurriculum.find(
        {},
        { subject: 1, 'topics.sub_topics.uids': 1 }
    ).lean();

    console.log(`   Found ${curricula.length} curriculum document(s)\n`);

    const map = new Map(); // uid (string) → subject (string)
    let conflictCount = 0;

    for (const curriculum of curricula) {
        const { subject, topics = [] } = curriculum;
        for (const topic of topics) {
            for (const subTopic of (topic.sub_topics || [])) {
                for (const uid of (subTopic.uids || [])) {
                    const key = String(uid);
                    if (map.has(key) && map.get(key) !== subject) {
                        // A uid appears in two different subjects – log & skip
                        console.warn(
                            `  ⚠️  uid ${key} found in BOTH "${map.get(key)}" and "${subject}" – keeping first mapping`
                        );
                        conflictCount++;
                    } else {
                        map.set(key, subject);
                    }
                }
            }
        }
    }

    console.log(`   Built subject map: ${map.size} unique uid(s)  (${conflictCount} conflict(s) ignored)\n`);
    return map;
}

// ── Step 2: bulkWrite subject onto importedquestions ─────────────────────────
async function backfill(subjectMap) {
    const allUids = [...subjectMap.keys()]; // string uids

    let totalMatched = 0;
    let totalModified = 0;
    let totalSkipped = 0; // uids not present in importedquestions
    let batchNum = 0;

    console.log(`⚙️   Processing ${allUids.length} uid(s) in batches of ${BATCH_SIZE} …\n`);

    for (let i = 0; i < allUids.length; i += BATCH_SIZE) {
        const batchUids = allUids.slice(i, i + BATCH_SIZE);
        batchNum++;

        const ops = batchUids.map((uid) => ({
            updateOne: {
                filter: { questionId: uid },
                update: { $set: { subject: subjectMap.get(uid) } },
            },
        }));

        if (DRY_RUN) {
            console.log(`  [DRY_RUN] Batch ${batchNum}: would write ${ops.length} op(s)`);
            totalMatched += ops.length;
            continue;
        }

        // Use the raw native collection to bypass Mongoose strict-mode field
        // stripping – otherwise unknown fields in $set are silently dropped.
        const nativeCol = mongoose.connection.db.collection('importedquestions');
        const result = await nativeCol.bulkWrite(ops, { ordered: false });

        const matched = result.matchedCount || 0;
        const modified = result.modifiedCount || 0;
        const skipped = ops.length - matched;

        totalMatched += matched;
        totalModified += modified;
        totalSkipped += skipped;

        process.stdout.write(
            `  Batch ${batchNum}: matched=${matched}  modified=${modified}  not-found=${skipped}\n`
        );
    }

    return { totalMatched, totalModified, totalSkipped };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    if (!MONGODB_URI) {
        console.error('❌  MONGODB_URI is not set in .env');
        process.exit(1);
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('  🏷️   Backfill "subject" on importedquestions');
    console.log('='.repeat(60));
    if (DRY_RUN) console.log('  🔍  DRY RUN mode — no DB writes');
    console.log('');

    await mongoose.connect(MONGODB_URI);
    console.log('✅  Connected to MongoDB\n');

    // 1. Build the uid→subject map
    const subjectMap = await buildSubjectMap();

    if (subjectMap.size === 0) {
        console.warn('⚠️  Subject map is empty – nothing to update.');
        await mongoose.disconnect();
        process.exit(0);
    }

    // 2. Backfill
    const { totalMatched, totalModified, totalSkipped } = await backfill(subjectMap);

    // 3. Summary
    console.log('');
    console.log('='.repeat(60));
    console.log('  📊  Summary');
    console.log(`  UIDs in curriculum map : ${subjectMap.size}`);
    if (!DRY_RUN) {
        console.log(`  Questions matched      : ${totalMatched}`);
        console.log(`  Questions updated      : ${totalModified}`);
        console.log(`  UIDs not in questions  : ${totalSkipped}`);
    }
    console.log('='.repeat(60));
    console.log('');

    await mongoose.disconnect();
    console.log('👋  Disconnected from MongoDB');
    process.exit(0);
}

main().catch((err) => {
    console.error('❌  Fatal:', err);
    process.exit(1);
});
