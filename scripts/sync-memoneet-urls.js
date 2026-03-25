/**
 * sync-memoneet-urls.js
 * 
 * High-concurrency script to sync question image URLs from memoneet.xyz API.
 * Focuses on Biology first.
 * 
 * Usage:
 *   node scripts/sync-memoneet-urls.js --subject biology --concurrency 50 --apply
 */

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const ImportedQuestion = require('../src/models/ImportedQuestion');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const MEMONEET_API = 'https://memoneet.xyz/api/get-question-images';
const args = process.argv.slice(2);

const SUBJECT = args.find(a => a.startsWith('--subject'))?.split('=')[1] || args[args.indexOf('--subject') + 1] || 'biology';
const LIMIT = parseInt(args.find(a => a.startsWith('--limit'))?.split('=')[1] || args[args.indexOf('--limit') + 1] || '0');
const CONCURRENCY = parseInt(args.find(a => a.startsWith('--concurrency'))?.split('=')[1] || args[args.indexOf('--concurrency') + 1] || '50');
const DRY_RUN = !args.includes('--apply');
const SKIP_EXISTING = !args.includes('--force'); // Default to skipping if already has imageUrl

const ensureLogDir = () => {
    const dir = path.join(__dirname, 'logs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
};

const main = async () => {
    console.log(`\n🚀 Starting Image Sync (Biology First)`);
    console.log(`   Subject: ${SUBJECT}`);
    console.log(`   Concurrency: ${CONCURRENCY}`);
    console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE (Updating DB)'}`);
    console.log(`   Target: Questions missing imageUrl (use --force to overwrite)\n`);

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB.');

    // 1. Build Query
    const query = { subject: SUBJECT };
    if (SKIP_EXISTING) {
        query.imageUrl = null;
    }

    // 2. Fetch Questions
    let questionCursor = ImportedQuestion.find(query, { _id: 1, questionId: 1, subject: 1 });
    if (LIMIT > 0) questionCursor = questionCursor.limit(LIMIT);
    
    const questions = await questionCursor.lean();
    console.log(`   Found ${questions.length} questions to process.\n`);

    if (questions.length === 0) {
        console.log('✨ No questions to process. Exiting.');
        await mongoose.disconnect();
        return;
    }

    const logDir = ensureLogDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = path.join(logDir, `sync-urls-${SUBJECT}-${stamp}.jsonl`);

    let success = 0;
    let failed = 0;
    let noImages = 0;
    let index = 0;

    // Multi-worker queue processing
    const queue = [...questions];
    const workers = Array.from({ length: CONCURRENCY }, async (_, workerId) => {
        while (queue.length > 0) {
            const q = queue.shift();
            if (!q) break;

            try {
                const response = await axios.post(MEMONEET_API, {
                    subject: q.subject,
                    uid: q.questionId
                }, { timeout: 15000 });

                const data = response.data;
                const questionUrls = Array.isArray(data.question) ? data.question : [];
                const explanationUrls = Array.isArray(data.explanation) ? data.explanation : [];

                const imageUrl = questionUrls[0] || null;
                const explanationImageUrl = explanationUrls[0] || null;

                if (!imageUrl && !explanationImageUrl) {
                    noImages++;
                }

                if (!DRY_RUN && (imageUrl || explanationImageUrl)) {
                    await ImportedQuestion.updateOne(
                        { _id: q._id },
                        { $set: { imageUrl, explanationImageUrl } }
                    );
                }

                success++;
                fs.appendFileSync(logPath, JSON.stringify({ questionId: q.questionId, imageUrl, status: 'success' }) + '\n');

            } catch (err) {
                failed++;
                fs.appendFileSync(logPath, JSON.stringify({ questionId: q.questionId, error: err.message, status: 'failed' }) + '\n');
            } finally {
                index++;
                if (index % 100 === 0 || index === questions.length) {
                    process.stdout.write(`\r   Processed: ${index}/${questions.length} (Success: ${success}, Fail: ${failed}, NoImg: ${noImages})`);
                }
            }
        }
    });

    await Promise.all(workers);

    console.log(`\n\n✅ Sync Complete! Log: ${logPath}\n`);
    await mongoose.disconnect();
};

main().catch(err => {
    console.error('💥 Fatal Error:', err);
    process.exit(1);
});
