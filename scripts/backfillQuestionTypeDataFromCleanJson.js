/**
 * backfillQuestionTypeDataFromCleanJson.js
 * ---------------------------------------
 * Backfills structured type data for ImportedQuestion and Question documents
 * by questionId using uploads/NEETforge_Clean_1774359216247.json.
 *
 * Updates only:
 * - typeData
 * - videoUrl
 * - isSupported
 * - unsupportedReason
 * - questionType (Question collection only, from source question_format)
 *
 * Usage:
 *   node scripts/backfillQuestionTypeDataFromCleanJson.js
 *   DRY_RUN=true node scripts/backfillQuestionTypeDataFromCleanJson.js
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
const TARGET_TYPES = new Set(['match', 'order', 'flashcard', 'video']);

function normalizeType(value) {
    return String(value || '').trim().toLowerCase();
}

function cleanText(value) {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length ? text : null;
}

function buildVideoUrl(videoId) {
    const id = cleanText(videoId);
    if (!id) return null;
    if (/^https?:\/\//i.test(id)) return id;
    return `https://www.youtube.com/watch?v=${id}`;
}

function parseMatchPair(raw, index) {
    const value = cleanText(raw);
    if (!value || value.toLowerCase() === 'null') return null;
    const parts = value.split(',').map((part) => cleanText(part)).filter(Boolean);
    if (parts.length < 2) return null;
    return {
        id: `pair-${index + 1}`,
        left: parts[0],
        right: parts.slice(1).join(', '),
    };
}

function parseOrderItem(raw, index) {
    const value = cleanText(raw);
    if (!value || value.toLowerCase() === 'null') return null;
    const match = value.match(/^\s*(\d+)\s*,\s*(.+)$/);
    if (match) {
        return {
            id: `item-${match[1]}`,
            text: cleanText(match[2]),
        };
    }
    return {
        id: `item-${index + 1}`,
        text: value,
    };
}

function toSafeKey(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^\w]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function buildStructuredTypeData(entry) {
    const type = normalizeType(entry?.question_format);
    const data = entry?.data || {};

    if (type === 'flashcard') {
        const front = cleanText(data.question_text);
        const back = cleanText(data.explanation);
        return {
            type,
            typeData: { front, back },
            videoUrl: null,
            isSupported: Boolean(front && back),
            unsupportedReason: front && back ? null : 'Flashcard front/back content is incomplete',
        };
    }

    if (type === 'video') {
        const videoId = cleanText(data.question_text);
        const promptSource = cleanText(data.subject_path);
        const prompt = promptSource ? promptSource.split('>>').pop().replace(/\(video\)/gi, '').trim() : null;
        const videoUrl = buildVideoUrl(videoId);
        return {
            type,
            typeData: {
                videoId,
                videoUrl,
                prompt: prompt || videoId,
            },
            videoUrl,
            isSupported: Boolean(videoUrl),
            unsupportedReason: videoUrl ? null : 'Video id is missing',
        };
    }

    if (type === 'match') {
        const rawOptions = [data.option_a, data.option_b, data.option_c, data.option_d];
        const pairs = rawOptions.map(parseMatchPair).filter(Boolean);
        return {
            type,
            typeData: { pairs },
            videoUrl: null,
            isSupported: pairs.length > 0,
            unsupportedReason: pairs.length > 0 ? null : 'Match pairs could not be derived from source options',
        };
    }

    if (type === 'order') {
        const rawOptions = [data.option_a, data.option_b, data.option_c, data.option_d];
        const items = rawOptions.map(parseOrderItem).filter((item) => item && item.text);
        const sortedItems = [...items].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
        const itemLookup = new Map(sortedItems.map((item) => [toSafeKey(item.text), item.id]));
        const correctTexts = String(data.correct_answer || '')
            .split('>')
            .map((part) => cleanText(part))
            .filter(Boolean);
        const correctOrder = correctTexts
            .map((text) => itemLookup.get(toSafeKey(text)))
            .filter(Boolean);
        return {
            type,
            typeData: {
                items: sortedItems,
                correctOrder,
            },
            videoUrl: null,
            isSupported: sortedItems.length > 0 && correctOrder.length > 0,
            unsupportedReason: sortedItems.length > 0 && correctOrder.length > 0
                ? null
                : 'Order items or correct order could not be derived from source data',
        };
    }

    return null;
}

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
        const type = normalizeType(entry?.question_format);
        if (!TARGET_TYPES.has(type)) continue;
        const structured = buildStructuredTypeData(entry);
        if (!structured) continue;

        updates.push({
            questionId: String(entry.id),
            type: structured.type,
            typeData: structured.typeData,
            videoUrl: structured.videoUrl,
            isSupported: structured.isSupported,
            unsupportedReason: structured.unsupportedReason,
        });
    }

    console.log(`Prepared structured updates for ${updates.length} source records`);
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
        const importedSet = {
            typeData: update.typeData,
            videoUrl: update.videoUrl,
            isSupported: update.isSupported,
            unsupportedReason: update.unsupportedReason,
        };

        const questionSet = {
            questionType: update.type,
            typeData: update.typeData,
            isSupported: update.isSupported,
            unsupportedReason: update.unsupportedReason,
        };

        if (update.videoUrl) {
            questionSet.videoExplanation = { url: update.videoUrl };
        }

        importedOps.push({
            updateOne: {
                filter: { questionId: update.questionId },
                update: {
                    $set: importedSet,
                },
            },
        });

        questionOps.push({
            updateOne: {
                filter: { questionId: update.questionId },
                update: {
                    $set: questionSet,
                    $unset: update.videoUrl ? {} : { videoExplanation: '' },
                },
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
