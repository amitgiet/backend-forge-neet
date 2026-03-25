/**
 * updateImportedQuestionTypeAndImageId.js
 * --------------------------------------
 * Updates only `type` and `imageId` on existing ImportedQuestion documents
 * by comparing against the NEETforge clean JSON export.
 *
 * Usage:
 *   node scripts/updateImportedQuestionTypeAndImageId.js
 *
 * Options (env vars):
 *   DRY_RUN=true   Parse and report changes without writing to MongoDB
 *   BATCH_SIZE=500 Number of update operations per bulkWrite
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const ImportedQuestion = require('../src/models/ImportedQuestion');

const JSON_FILE = path.join(__dirname, '..', 'uploads', 'NEETforge_Clean_1774359216247.json');
const DRY_RUN = process.env.DRY_RUN === 'true';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '500', 10);

function normalizeType(questionFormat) {
    if (typeof questionFormat !== 'string') return null;
    const value = questionFormat.trim().toLowerCase();
    return value || null;
}

function normalizeImageId(imageId) {
    if (imageId === undefined || imageId === null) return null;
    const value = String(imageId).trim();
    return value || null;
}

async function connectDB() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');
}

async function flushBatch(batch, stats) {
    if (batch.length === 0) return;

    const result = await ImportedQuestion.bulkWrite(batch, { ordered: false });
    stats.matched += result.matchedCount || 0;
    stats.modified += result.modifiedCount || 0;
}

async function main() {
    console.log(`Reading source file: ${JSON_FILE}`);

    if (!fs.existsSync(JSON_FILE)) {
        throw new Error(`File not found: ${JSON_FILE}`);
    }

    const raw = fs.readFileSync(JSON_FILE, 'utf8');
    const sourceData = JSON.parse(raw);
    const entries = Object.values(sourceData || {});

    console.log(`Source records: ${entries.length}`);
    console.log(`Dry run: ${DRY_RUN}`);
    console.log(`Batch size: ${BATCH_SIZE}`);

    if (!DRY_RUN) {
        await connectDB();
    }

    const stats = {
        total: entries.length,
        prepared: 0,
        matched: 0,
        modified: 0,
        missingInDb: 0,
        skipped: 0,
    };

    const sourceById = new Map();

    for (const entry of entries) {
        const questionId = entry && entry.id ? String(entry.id).trim() : null;
        const type = normalizeType(entry && entry.question_format);
        const imageId = normalizeImageId(entry && entry.image_id);

        if (!questionId || !type) {
            stats.skipped++;
            continue;
        }

        sourceById.set(questionId, { type, imageId });
    }

    const questionIds = Array.from(sourceById.keys());
    console.log(`Valid source mappings: ${questionIds.length}`);

    const existingDocs = await ImportedQuestion.find(
        { questionId: { $in: questionIds } },
        { questionId: 1, type: 1, imageId: 1 }
    ).lean();

    const existingById = new Map(existingDocs.map((doc) => [String(doc.questionId), doc]));
    stats.missingInDb = questionIds.length - existingDocs.length;

    const ops = [];

    for (const questionId of questionIds) {
        const source = sourceById.get(questionId);
        const existing = existingById.get(questionId);

        if (!existing) {
            continue;
        }

        const nextType = source.type;
        const nextImageId = source.imageId;
        const currentType = existing.type ?? null;
        const currentImageId = existing.imageId ?? null;

        if (currentType === nextType && currentImageId === nextImageId) {
            continue;
        }

        ops.push({
            updateOne: {
                filter: { questionId },
                update: {
                    $set: {
                        type: nextType,
                        imageId: nextImageId,
                    },
                },
            },
        });

        stats.prepared++;
    }

    console.log(`Existing docs found: ${existingDocs.length}`);
    console.log(`Missing in DB: ${stats.missingInDb}`);
    console.log(`Updates prepared: ${stats.prepared}`);

    if (!DRY_RUN) {
        let batch = [];

        for (const op of ops) {
            batch.push(op);

            if (batch.length >= BATCH_SIZE) {
                await flushBatch(batch, stats);
                batch = [];
            }
        }

        await flushBatch(batch, stats);
    }

    console.log('');
    console.log('Summary');
    console.log(`Total source records: ${stats.total}`);
    console.log(`Skipped source records: ${stats.skipped}`);
    console.log(`Updates prepared: ${stats.prepared}`);
    console.log(`DB matches: ${stats.matched}`);
    console.log(`DB modified: ${stats.modified}`);
    console.log(`Missing in DB: ${stats.missingInDb}`);

    if (!DRY_RUN) {
        await mongoose.disconnect();
    }
}

main().catch(async (error) => {
    console.error('Fatal error:', error.message);
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    process.exit(1);
});
