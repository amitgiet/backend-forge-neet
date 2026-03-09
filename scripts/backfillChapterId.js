/**
 * scripts/backfillChapterId.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Walks every document in `importedcurriculum` and, for each UID found in
 *   topics[].sub_topics[].uids[]
 * writes the following fields onto the matching `importedquestions` doc:
 *
 *   chapterId   ← ImportedCurriculum._id  (e.g. "DIVERSITY IN LIVING WORLD")
 *   topic       ← topics[i].topic
 *   subTopic    ← topics[i].sub_topics[j].subTopic
 *   subject     ← ImportedCurriculum.subject  (only if not already set)
 *
 * Usage:
 *   node scripts/backfillChapterId.js
 *
 * Optional env flags:
 *   DRY_RUN=true    – builds the map and prints stats but skips DB writes
 *   BATCH_SIZE=500  – bulkWrite batch size (default 500)
 *
 * Safe to re-run – uses $set so repeated runs overwrite with same values.
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

// ── Step 1: build uid → { chapterId, topic, subTopic, subject } map ──────────
async function buildUIDMap() {
    console.log('📖  Reading importedcurriculum …');

    const curricula = await ImportedCurriculum.find(
        {},
        { _id: 1, subject: 1, 'topics.topic': 1, 'topics.sub_topics.subTopic': 1, 'topics.sub_topics.uids': 1 }
    ).lean();

    console.log(`   Found ${curricula.length} curriculum document(s)\n`);

    // uid (string) → { chapterId, topic, subTopic, subject }
    const map = new Map();
    let conflicts = 0;

    for (const curriculum of curricula) {
        const chapterId = String(curriculum._id);
        const subject = curriculum.subject || null;

        for (const topicObj of (curriculum.topics || [])) {
            const topic = topicObj.topic || '';

            for (const stObj of (topicObj.sub_topics || [])) {
                const subTopic = stObj.subTopic || '';

                for (const uid of (stObj.uids || [])) {
                    const key = String(uid);

                    if (map.has(key)) {
                        conflicts++;
                        // Keep the first mapping encountered
                        continue;
                    }

                    map.set(key, { chapterId, topic, subTopic, subject });
                }
            }
        }
    }

    console.log(`   Built UID map: ${map.size} unique UIDs  (${conflicts} conflict(s) kept first mapping)\n`);
    return map;
}

// ── Step 2: bulkWrite onto importedquestions ──────────────────────────────────
async function backfill(uidMap) {
    const allUids = [...uidMap.keys()];

    let totalMatched = 0;
    let totalModified = 0;
    let totalSkipped = 0;
    let batchNum = 0;

    console.log(`⚙️   Processing ${allUids.length} UIDs in batches of ${BATCH_SIZE} …\n`);

    // Use the native collection to bypass Mongoose strict-mode field stripping
    const nativeCol = mongoose.connection.db.collection('importedquestions');

    for (let i = 0; i < allUids.length; i += BATCH_SIZE) {
        const batchUids = allUids.slice(i, i + BATCH_SIZE);
        batchNum++;

        const ops = batchUids.map((uid) => {
            const { chapterId, topic, subTopic, subject } = uidMap.get(uid);

            // Build $set — only backfill subject if it might be missing
            const $set = { chapterId, topic, subTopic };
            if (subject) {
                // Use $setOnInsert equivalent: only set subject if it is null/missing
                // We'll always set it — backfillQuestionSubject.js already set it but
                // this keeps the script self-contained.
                $set.subject = subject;
            }

            return {
                updateOne: {
                    filter: { questionId: uid },
                    update: { $set },
                },
            };
        });

        if (DRY_RUN) {
            console.log(`  [DRY_RUN] Batch ${batchNum}: would write ${ops.length} op(s)`);
            totalMatched += ops.length;
            continue;
        }

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
    console.log('='.repeat(62));
    console.log('  🏷️   Backfill chapterId / topic / subTopic on importedquestions');
    console.log('='.repeat(62));
    if (DRY_RUN) console.log('  🔍  DRY RUN mode — no DB writes');
    console.log('');

    await mongoose.connect(MONGODB_URI);
    console.log('✅  Connected to MongoDB\n');

    // 1. Build UID → curriculum-data map
    const uidMap = await buildUIDMap();

    if (uidMap.size === 0) {
        console.warn('⚠️  UID map is empty – nothing to update.');
        await mongoose.disconnect();
        process.exit(0);
    }

    // 2. Backfill
    const { totalMatched, totalModified, totalSkipped } = await backfill(uidMap);

    // 3. Summary
    console.log('');
    console.log('='.repeat(62));
    console.log('  📊  Summary');
    console.log(`  UIDs in curriculum map    : ${uidMap.size}`);
    if (!DRY_RUN) {
        console.log(`  Questions matched         : ${totalMatched}`);
        console.log(`  Questions updated         : ${totalModified}`);
        console.log(`  UIDs not in questions     : ${totalSkipped}`);
        console.log('');
        console.log('  ✅  Fields written: chapterId, topic, subTopic, subject');
        console.log('  ℹ️   Next: run backfillDifficulty.js to set difficulty levels');
    }
    console.log('='.repeat(62));
    console.log('');

    await mongoose.disconnect();
    console.log('👋  Disconnected from MongoDB');
    process.exit(0);
}

main().catch((err) => {
    console.error('❌  Fatal:', err);
    process.exit(1);
});
