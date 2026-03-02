/**
 * scripts/importCurriculum.js
 * ----------------------------
 * Reads biology.json, chemistry.json and pysics.json from /uploads and
 * upserts each chapter document into the `importedcurriculum` collection.
 *
 * Usage:
 *   node scripts/importCurriculum.js
 *
 * Optional env:
 *   DRY_RUN=true   — parse & log but skip DB writes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const ImportedCurriculum = require('../src/models/ImportedCurriculum');

// ── Config ─────────────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;
const DRY_RUN = process.env.DRY_RUN === 'true';
const UPLOADSDIR = path.join(__dirname, '..', 'uploads');
const BATCH_SIZE = 100;

const SUBJECTS = [
    { file: 'biology.json', subject: 'biology' },
    { file: 'chemistry.json', subject: 'chemistry' },
    { file: 'pysics.json', subject: 'physics' }, // note: filename has typo in uploads dir
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function readJSON(filename) {
    const filepath = path.join(UPLOADSDIR, filename);
    if (!fs.existsSync(filepath)) {
        throw new Error(`File not found: ${filepath}`);
    }
    const raw = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(raw);
}

async function importSubject(data, subject) {
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    // Process in batches
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        const ops = [];

        for (let j = 0; j < batch.length; j++) {
            const chapter = batch[j];

            try {
                const doc = {
                    subject,
                    type: chapter.type || null,
                    isHidden: chapter.isHidden === true,
                    order: i + j, // global insertion order within subject
                    topics: (chapter.topics || []).map((t) => ({
                        topic: t.topic || '',
                        sub_topics: (t.sub_topics || []).map((st) => ({
                            subTopic: st.subTopic || '',
                            uids: (st.uids || []).map(Number),
                            hidden_uids: (st.hidden_uids || []).map(Number),
                            video: st.video || null,
                            notes: st.notes || null,
                        })),
                    })),
                };

                ops.push({
                    updateOne: {
                        filter: { _id: chapter._id },
                        update: { $set: doc },
                        upsert: true,
                    },
                });
            } catch (err) {
                console.error(
                    `  ✗ Error building doc for chapter "${chapter._id}": ${err.message}`
                );
                errors++;
            }
        }

        if (ops.length === 0) continue;

        if (DRY_RUN) {
            console.log(`  [DRY_RUN] Would upsert ${ops.length} chapter(s) for "${subject}"`);
            inserted += ops.length;
            continue;
        }

        const result = await ImportedCurriculum.bulkWrite(ops, { ordered: false });
        inserted += result.upsertedCount || 0;
        updated += result.modifiedCount || 0;
    }

    return { inserted, updated, errors };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
    if (!MONGODB_URI) {
        console.error('❌  MONGODB_URI is not set in .env');
        process.exit(1);
    }

    console.log('');
    console.log('='.repeat(55));
    console.log('  📚  ImportedCurriculum Import Script');
    console.log('='.repeat(55));
    if (DRY_RUN) console.log('  🔍  DRY RUN mode — no DB writes');
    console.log('');

    await mongoose.connect(MONGODB_URI);
    console.log('✅  Connected to MongoDB\n');

    const totals = { inserted: 0, updated: 0, errors: 0 };

    for (const { file, subject } of SUBJECTS) {
        process.stdout.write(`📖  Reading ${file} … `);
        let data;
        try {
            data = readJSON(file);
            console.log(`${data.length} chapters`);
        } catch (err) {
            console.log(`FAILED (${err.message})`);
            totals.errors++;
            continue;
        }

        console.log(`   Importing "${subject}" …`);
        const result = await importSubject(data, subject);
        console.log(
            `   ✓ inserted: ${result.inserted}  updated: ${result.updated}  errors: ${result.errors}\n`
        );
        totals.inserted += result.inserted;
        totals.updated += result.updated;
        totals.errors += result.errors;
    }

    console.log('='.repeat(55));
    console.log(`  Summary`);
    console.log(`  Total inserted : ${totals.inserted}`);
    console.log(`  Total updated  : ${totals.updated}`);
    console.log(`  Total errors   : ${totals.errors}`);
    console.log('='.repeat(55));
    console.log('');

    await mongoose.disconnect();
    console.log('👋  Disconnected from MongoDB');
    process.exit(totals.errors > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('❌  Fatal:', err);
    process.exit(1);
});
