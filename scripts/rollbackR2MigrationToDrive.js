/**
 * rollbackR2MigrationToDrive.js
 *
 * Reads scripts/migration_mapping.jsonl and rolls back to oldUrl (Google Drive) in MongoDB.
 * 
 * Usage:
 *   node scripts/rollbackR2MigrationToDrive.js --dry-run
 *   node scripts/rollbackR2MigrationToDrive.js --apply
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const MAPPING_FILE = path.join(__dirname, 'migration_mapping.jsonl');
const IS_APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 500;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is missing in .env');
    process.exit(1);
}

if (!fs.existsSync(MAPPING_FILE)) {
    console.error(`❌ Mapping file not found: ${MAPPING_FILE}`);
    process.exit(1);
}

const parseDocId = (collection, docId) => {
    if (collection === 'formulacards' || collection === 'mocktests') {
        try {
            return new ObjectId(docId);
        } catch (e) {
            return docId;
        }
    }
    return String(docId);
};

async function main() {
    console.log('======================================================');
    console.log(`⏪ ROLLBACK: R2 URLs to Google Drive URLs in MongoDB`);
    console.log(`   Mode: ${IS_APPLY ? '🔥 LIVE APPLY (Rolling Back DB)' : '🛡️  DRY RUN (Read-Only Validation)'}`);
    console.log(`   Mapping File: ${MAPPING_FILE}`);
    console.log('======================================================\n');

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db();
    console.log('✅ Connected to MongoDB\n');

    const fileStream = fs.createReadStream(MAPPING_FILE);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    const batchesByCol = {};
    const statsByCol = {};

    let totalEntries = 0;
    let totalMatched = 0;
    let totalModified = 0;

    const flushBatch = async (collection) => {
        const ops = batchesByCol[collection];
        if (!ops || ops.length === 0) return;

        batchesByCol[collection] = [];

        if (!statsByCol[collection]) {
            statsByCol[collection] = { entries: 0, matched: 0, modified: 0 };
        }

        if (IS_APPLY) {
            try {
                const res = await db.collection(collection).bulkWrite(ops, { ordered: false });
                statsByCol[collection].matched += (res.matchedCount || 0);
                statsByCol[collection].modified += (res.modifiedCount || 0);
                totalMatched += (res.matchedCount || 0);
                totalModified += (res.modifiedCount || 0);
            } catch (err) {
                console.error(`❌ Error in bulkWrite for ${collection}:`, err.message);
            }
        } else {
            statsByCol[collection].matched += ops.length;
            totalMatched += ops.length;
        }
    };

    for await (const line of rl) {
        if (!line.trim()) continue;
        let item;
        try {
            item = JSON.parse(line);
        } catch (e) {
            continue;
        }

        const { collection, docId, field, oldUrl } = item;
        if (!collection || !docId || !field || !oldUrl) continue;

        totalEntries++;
        if (!batchesByCol[collection]) batchesByCol[collection] = [];
        if (!statsByCol[collection]) statsByCol[collection] = { entries: 0, matched: 0, modified: 0 };

        statsByCol[collection].entries++;

        const filterId = parseDocId(collection, docId);
        batchesByCol[collection].push({
            updateOne: {
                filter: { _id: filterId },
                update: { $set: { [field]: oldUrl } }
            }
        });

        if (batchesByCol[collection].length >= BATCH_SIZE) {
            await flushBatch(collection);
            process.stdout.write(`\rProcessed ${totalEntries} entries...`);
        }
    }

    // Flush remaining
    for (const col of Object.keys(batchesByCol)) {
        await flushBatch(col);
    }

    console.log(`\n\n======================================================`);
    console.log(`📊 ROLLBACK SUMMARY (${IS_APPLY ? 'LIVE APPLY' : 'DRY RUN'})`);
    console.log('======================================================');
    console.log(`Total Entries Restored: ${totalEntries}`);
    console.log(`Total Matched: ${totalMatched}`);
    if (IS_APPLY) {
        console.log(`Total Modified / Reverted: ${totalModified}`);
    }

    console.log('\nBreakdown by Collection:');
    for (const [col, s] of Object.entries(statsByCol)) {
        console.log(`  - ${col}: ${s.entries} fields | Matched: ${s.matched} | Modified: ${s.modified}`);
    }

    console.log('======================================================\n');
    await client.close();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
