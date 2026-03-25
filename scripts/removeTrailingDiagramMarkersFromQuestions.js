/**
 * removeTrailingDiagramMarkersFromQuestions.js
 * -------------------------------------------
 * Removes trailing diagram marker tokens from ImportedQuestion.question and
 * ImportedQuestion.questionHi without touching any other fields.
 *
 * Examples removed from the end of a question:
 *   diagram(n0105)
 *   diagram (0212)
 *   Refer diagram (22476Q)
 *   (0213)
 */

require('dotenv').config();
const mongoose = require('mongoose');

const ImportedQuestion = require('../src/models/ImportedQuestion');

const DRY_RUN = process.env.DRY_RUN === 'true';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '500', 10);

// Remove only trailing diagram/id markers at the end of the string.
function stripTrailingDiagramMarker(value) {
    if (typeof value !== 'string') return value;

    let next = value.trim();

    // Repeatedly strip trailing markers if more than one was appended.
    const trailingPatterns = [
        /\s*[\[\(]?\s*diagram\s*\([^)]+\)\s*[\]\)]?\s*$/i,
        /\s*[\[\(]?\s*refer(?:\s+the|\s+below|\s+to)?\s+diagram\s*\([^)]+\)\s*[\]\)]?\s*$/i,
        /\s*[\[\(]?\s*diagram\s+[A-Za-z0-9_-]+\s*[\]\)]?\s*$/i,
        /\s*[\[\(]\s*[A-Za-z0-9_-]{3,}\s*[\]\)]\s*$/i,
    ];

    let changed = false;
    let loopGuard = 0;

    while (loopGuard < 10) {
        loopGuard += 1;
        let matched = false;

        for (const pattern of trailingPatterns) {
            if (pattern.test(next)) {
                next = next.replace(pattern, '').trim();
                matched = true;
                changed = true;
            }
        }

        if (!matched) break;
    }

    // Tidy dangling punctuation left just before the removed marker.
    if (changed) {
        next = next
            .replace(/\s+$/g, '')
            .replace(/\s+([?.!,;:])/g, '$1')
            .replace(/[,\-:;]\s*$/g, '')
            .trim();
    }

    return next || value.trim();
}

async function connectDB() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');
}

async function main() {
    await connectDB();

    const cursor = ImportedQuestion.find(
        {
            $or: [
                { question: /diagram|\([A-Za-z0-9_-]{3,}\)\s*$/i },
                { questionHi: /diagram|\([A-Za-z0-9_-]{3,}\)\s*$/i },
            ],
        },
        { questionId: 1, question: 1, questionHi: 1 }
    ).lean().cursor();

    const ops = [];
    const stats = {
        scanned: 0,
        prepared: 0,
        modified: 0,
    };

    for await (const doc of cursor) {
        stats.scanned += 1;

        const nextQuestion = stripTrailingDiagramMarker(doc.question);
        const nextQuestionHi = stripTrailingDiagramMarker(doc.questionHi);

        const update = {};

        if (doc.question !== nextQuestion) {
            update.question = nextQuestion;
        }

        if (doc.questionHi !== nextQuestionHi) {
            update.questionHi = nextQuestionHi;
        }

        if (Object.keys(update).length === 0) {
            continue;
        }

        ops.push({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: update },
            },
        });
        stats.prepared += 1;

        if (!DRY_RUN && ops.length >= BATCH_SIZE) {
            const result = await ImportedQuestion.bulkWrite(ops, { ordered: false });
            stats.modified += result.modifiedCount || 0;
            ops.length = 0;
        }
    }

    if (!DRY_RUN && ops.length > 0) {
        const result = await ImportedQuestion.bulkWrite(ops, { ordered: false });
        stats.modified += result.modifiedCount || 0;
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
