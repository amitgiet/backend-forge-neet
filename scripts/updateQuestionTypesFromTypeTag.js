/**
 * updateQuestionTypesFromTypeTag.js
 * --------------------------------
 * Rewrites stored question type using source JSON `data.type_tag`.
 *
 * Updates:
 * - ImportedQuestion.type
 * - Question.questionType
 *
 * Matches by questionId only.
 *
 * Usage:
 *   node scripts/updateQuestionTypesFromTypeTag.js
 *   DRY_RUN=true node scripts/updateQuestionTypesFromTypeTag.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const ImportedQuestion = require('../src/models/ImportedQuestion');
const Question = require('../src/models/Question');

const JSON_FILE = path.join(__dirname, '..', 'uploads', 'NEETforge_Clean_1774359216247.json');
const DRY_RUN = process.env.DRY_RUN === 'true';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '500', 10);

const normalizeTypeTag = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw || raw === 'null') return null;
    if (raw === 'fill-blank' || raw === 'fillblank') return 'fillup';
    if (raw === 'diagram-label') return 'match';
    return raw;
};

async function connectDB() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');
}

async function flushBulk(model, ops) {
    if (!ops.length) return { matchedCount: 0, modifiedCount: 0 };
    return model.bulkWrite(ops, { ordered: false });
}

async function main() {
    if (!fs.existsSync(JSON_FILE)) {
        throw new Error(`Source file not found: ${JSON_FILE}`);
    }

    const sourceData = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
    const updates = [];

    for (const entry of Object.values(sourceData)) {
        const typeTag = normalizeTypeTag(entry?.data?.type_tag);
        if (!typeTag) continue;
        updates.push({
            questionId: String(entry.id),
            typeTag,
        });
    }

    console.log(`Prepared type-tag updates for ${updates.length} source records`);

    if (DRY_RUN) {
        console.log('Dry run enabled, no DB writes performed');
        return;
    }

    await connectDB();

    let importedOps = [];
    let questionOps = [];
    const stats = {
        importedMatched: 0,
        importedModified: 0,
        questionMatched: 0,
        questionModified: 0,
    };

    for (const update of updates) {
        importedOps.push({
            updateOne: {
                filter: { questionId: update.questionId },
                update: { $set: { type: update.typeTag } },
            },
        });

        questionOps.push({
            updateOne: {
                filter: { questionId: update.questionId },
                update: { $set: { questionType: update.typeTag } },
            },
        });

        if (importedOps.length >= BATCH_SIZE) {
            const importedResult = await flushBulk(ImportedQuestion, importedOps);
            const questionResult = await flushBulk(Question, questionOps);
            stats.importedMatched += importedResult.matchedCount || 0;
            stats.importedModified += importedResult.modifiedCount || 0;
            stats.questionMatched += questionResult.matchedCount || 0;
            stats.questionModified += questionResult.modifiedCount || 0;
            importedOps = [];
            questionOps = [];
        }
    }

    if (importedOps.length || questionOps.length) {
        const importedResult = await flushBulk(ImportedQuestion, importedOps);
        const questionResult = await flushBulk(Question, questionOps);
        stats.importedMatched += importedResult.matchedCount || 0;
        stats.importedModified += importedResult.modifiedCount || 0;
        stats.questionMatched += questionResult.matchedCount || 0;
        stats.questionModified += questionResult.modifiedCount || 0;
    }

    console.log(JSON.stringify(stats, null, 2));
    await mongoose.disconnect();
}

main().catch(async (error) => {
    console.error('Fatal error:', error.message);
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    process.exit(1);
});
