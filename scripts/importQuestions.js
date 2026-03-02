/**
 * importQuestions.js
 * ------------------
 * Imports the exported IndexedDB JSON (questions-structured-export.json)
 * into the MongoDB `importedquestions` collection using the ImportedQuestion model.
 *
 * Usage:
 *   node scripts/importQuestions.js
 *
 * Options (env vars):
 *   BATCH_SIZE      – how many docs per bulkWrite (default: 500)
 *   SKIP_DELETED    – set to "true" to skip questions with status=DELETED (default: false)
 *   DRY_RUN         – set to "true" to parse & log counts without writing to DB (default: false)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const ImportedQuestion = require('../src/models/ImportedQuestion');

// ── Config ─────────────────────────────────────────────────────────────────
const JSON_FILE = path.join(__dirname, '..', 'uploads', 'questions-structured-export.json');
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '500', 10);
const SKIP_DELETED = process.env.SKIP_DELETED === 'true';
const DRY_RUN = process.env.DRY_RUN === 'true';

// ── DB ─────────────────────────────────────────────────────────────────────
async function connectDB() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');
}

// ── Helpers ────────────────────────────────────────────────────────────────
function buildDoc(id, q) {
    return {
        questionId: String(id),
        question: q.question || null,
        correct_answer: q.correct_answer || null,
        correct_option: q.correct_option || null,
        options: {
            A: (q.options && q.options.A) || null,
            B: (q.options && q.options.B) || null,
            C: (q.options && q.options.C) || null,
            D: (q.options && q.options.D) || null,
        },
        explanation: q.explanation || null,
        source: q.source || null,
        type: q.type || 'mcq',
        status: q.status || 'NEW',
        chapter_start: q.chapter_start || null,
        chapter_end: q.chapter_end || null,
    };
}

async function flushBatch(batch, stats) {
    if (batch.length === 0) return;

    const ops = batch.map((doc) => ({
        updateOne: {
            filter: { questionId: doc.questionId },
            update: { $set: doc },
            upsert: true,
        },
    }));

    const result = await ImportedQuestion.bulkWrite(ops, { ordered: false });
    stats.inserted += result.upsertedCount;
    stats.updated += result.modifiedCount;
    stats.processed += batch.length;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
    console.log('📂 Reading JSON file…');
    console.log(`   File : ${JSON_FILE}`);

    if (!fs.existsSync(JSON_FILE)) {
        console.error('❌ File not found:', JSON_FILE);
        process.exit(1);
    }

    const raw = fs.readFileSync(JSON_FILE, 'utf-8');
    const data = JSON.parse(raw);
    const keys = Object.keys(data);

    console.log(`📊 Total records in file : ${keys.length}`);
    console.log(`   Batch size            : ${BATCH_SIZE}`);
    console.log(`   Skip DELETED          : ${SKIP_DELETED}`);
    console.log(`   Dry run               : ${DRY_RUN}`);
    console.log('');

    if (!DRY_RUN) {
        await connectDB();
    }

    const stats = {
        total: keys.length,
        processed: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
    };

    let batch = [];

    for (let i = 0; i < keys.length; i++) {
        const id = keys[i];
        const q = data[id];

        // Skip DELETED questions if flag is set
        if (SKIP_DELETED && q && q.status === 'DELETED') {
            stats.skipped++;
            continue;
        }

        // Skip malformed entries (no question text at all)
        if (!q || (!q.question && !q.error)) {
            stats.skipped++;
            continue;
        }

        // If the export had an error for this key, still store what we have
        if (q.error) {
            stats.skipped++;
            continue;
        }

        try {
            const doc = buildDoc(id, q);
            batch.push(doc);
        } catch (err) {
            stats.errors++;
            console.warn(`⚠️  Build error for id ${id}:`, err.message);
            continue;
        }

        // Flush when batch is full
        if (batch.length >= BATCH_SIZE) {
            if (!DRY_RUN) {
                await flushBatch(batch, stats);
            } else {
                stats.processed += batch.length;
            }
            batch = [];

            // Progress log every 10 batches
            if (Math.floor(stats.processed / BATCH_SIZE) % 10 === 0) {
                const pct = ((stats.processed / stats.total) * 100).toFixed(1);
                console.log(`   ↳ Progress: ${stats.processed}/${stats.total} (${pct}%)`);
            }
        }
    }

    // Flush remaining
    if (!DRY_RUN) {
        await flushBatch(batch, stats);
    } else {
        stats.processed += batch.length;
    }

    // ── Summary ──
    console.log('');
    console.log('════════════════════════════════');
    console.log('✅ Import complete!');
    console.log(`   Total in file : ${stats.total}`);
    console.log(`   Processed     : ${stats.processed}`);
    console.log(`   Inserted (new): ${stats.inserted}`);
    console.log(`   Updated       : ${stats.updated}`);
    console.log(`   Skipped       : ${stats.skipped}`);
    console.log(`   Errors        : ${stats.errors}`);
    console.log('════════════════════════════════');

    if (!DRY_RUN) {
        await mongoose.disconnect();
    }

    process.exit(0);
}

main().catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
