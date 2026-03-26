/**
 * seedChapterResources.js
 *
 * Reads all three npcm SQLite DBs + Drive migration log files,
 * builds one ChapterResource document per (subject, chapterName),
 * and upserts them into MongoDB.
 *
 * Run: node scripts/seedChapterResources.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const mongoose = require('mongoose');

const MONGODB_URI = (process.env.MONGODB_URI || '').replace(/"/g, '');

// ── DB config ─────────────────────────────────────────────────────────────────
const DB_CONFIGS = [
    {
        subject: 'biology',
        dbPath: path.join(__dirname, '../uploads/npcm_bio_database.db'),
        table: 'npcmBio',
        logFile: path.join(__dirname, 'logs/notes_pdf_migration_log.json'),
    },
    {
        subject: 'chemistry',
        dbPath: path.join(__dirname, '../uploads/npcm_chem_database.db'),
        table: 'npcmChem',
        logFile: path.join(__dirname, 'logs/chem_notes_pdf_migration_log.json'),
    },
    {
        subject: 'physics',
        dbPath: path.join(__dirname, '../uploads/npcm_phy_database.db'),
        table: 'npcmPhy',
        logFile: path.join(__dirname, 'logs/phy_notes_pdf_migration_log.json'),
    },
];


// ── Helpers ───────────────────────────────────────────────────────────────────
const queryDB = (dbPath, sql, params = []) =>
    new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) return reject(err);
        });
        db.all(sql, params, (err, rows) => {
            db.close();
            if (err) return reject(err);
            resolve(rows);
        });
    });

const parseChapterName = (topicName) => {
    if (!topicName) return null;
    return topicName.split('>>')[0].trim();
};

const parseTitle = (topicName) => {
    if (!topicName) return null;
    const parts = topicName.split('>>');
    return parts.length >= 3 ? parts[2].trim() : (parts[1]?.trim() || null);
};

const toSlug = (name) =>
    name?.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || null;

const normalizeQuizType = (t) => {
    if (!t) return 'unknown';
    return t.toLowerCase().trim();   // handles "Meme" -> "meme", "gridlock" stays
};

const loadDriveLog = (logFile) => {
    const map = new Map(); // uniqueId -> log entry
    if (!fs.existsSync(logFile)) {
        console.warn(`Log file missing: ${logFile}`);
        return map;
    }
    try {
        const entries = JSON.parse(fs.readFileSync(logFile, 'utf8'));
        for (const e of entries) {
            if (e.uniqueId) map.set(e.uniqueId, e);
        }
    } catch (err) {
        console.warn(`Could not parse log file ${logFile}: ${err.message}`);
    }
    return map;
};

// ── Main ──────────────────────────────────────────────────────────────────────
const main = async () => {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    // Late-require so Mongoose is connected before model is used
    const ChapterResource = require('../src/models/ChapterResource');

    // Map of docId -> ChapterResource plain object being built
    // docId = "{subject}::{chapterName}"
    const docsMap = new Map();

    const getOrCreate = (subject, chapterName) => {
        const id = `${subject}::${chapterName}`;
        if (!docsMap.has(id)) {
            docsMap.set(id, {
                _id: id,
                subject,
                chapterName,
                slug: toSlug(chapterName),
                notes: { mode: null, driveLink: null, driveId: null, pageFiles: [], pageCount: 0, migratedAt: null },
                podcasts: [],
                crosswords: [],
                memes: [],
                gridlocks: [],
            });
        }
        return docsMap.get(id);
    };

    // ── Process each subject ──────────────────────────────────────────────────
    for (const cfg of DB_CONFIGS) {
        console.log(`\nProcessing ${cfg.subject}...`);

        // Load Drive notes log
        const driveLog = loadDriveLog(cfg.logFile);
        console.log(`  Drive log entries (notes): ${driveLog.size}`);

        // Load Drive podcast log (if Bio or Chem)
        let podcastLog = new Map();
        if (cfg.subject === 'biology') {
            const pLogFile = path.join(__dirname, 'logs/bio_podcast_migration_log.json');
            podcastLog = loadDriveLog(pLogFile);
            console.log(`  Drive log entries (podcasts): ${podcastLog.size}`);
        } else if (cfg.subject === 'chemistry') {
            const pLogFile = path.join(__dirname, 'logs/chem_podcast_migration_log.json');
            podcastLog = loadDriveLog(pLogFile);
            console.log(`  Drive log entries (podcasts): ${podcastLog.size}`);
        } else if (cfg.subject === 'physics') {
            const pLogFile = path.join(__dirname, 'logs/phy_podcast_migration_log.json');
            podcastLog = loadDriveLog(pLogFile);
            console.log(`  Drive log entries (podcasts): ${podcastLog.size}`);
        }

        // Load Drive meme log (if Bio or Chem)
        let memeLog = new Map();
        if (cfg.subject === 'biology') {
            const mLogFile = path.join(__dirname, 'logs/bio_meme_migration_log.json');
            memeLog = loadDriveLog(mLogFile);
            console.log(`  Drive log entries (memes): ${memeLog.size}`);
        } else if (cfg.subject === 'chemistry') {
            const mLogFile = path.join(__dirname, 'logs/chem_meme_migration_log.json');
            memeLog = loadDriveLog(mLogFile);
            console.log(`  Drive log entries (memes): ${memeLog.size}`);
        } else if (cfg.subject === 'physics') {
            const mLogFile = path.join(__dirname, 'logs/phy_meme_migration_log.json');
            memeLog = loadDriveLog(mLogFile);
            console.log(`  Drive log entries (memes): ${memeLog.size}`);
        }

        // Fetch all rows from the subject DB
        const rows = await queryDB(
            cfg.dbPath,
            `SELECT uniqueId, topicName, question, answer, explanation, quizType FROM ${cfg.table}`,
        );
        console.log(`  DB rows: ${rows.length}`);

        for (const row of rows) {
            const chapterName = parseChapterName(row.topicName);
            if (!chapterName) continue;

            const rawType = row.quizType ?? '';
            const qType = normalizeQuizType(rawType);
            const doc = getOrCreate(cfg.subject, chapterName);

            if (qType === 'notes') {
                // Only populate notes once per chapter (skip duplicates)
                if (doc.notes.mode) continue;

                const driveEntry = driveLog.get(String(row.uniqueId));
                if (!driveEntry || driveEntry.status !== 'success') continue;

                doc.notes = {
                    mode: driveEntry.mode,
                    driveLink: driveEntry.driveLink || null,
                    driveId: driveEntry.driveId || null,
                    pageFiles: driveEntry.pageFiles || [],
                    pageCount: driveEntry.pageCount || (driveEntry.pageFiles?.length ?? 0),
                    migratedAt: new Date(),
                };

            } else if (qType === 'podcast') {
                const pEntry = podcastLog.get(String(row.uniqueId));
                doc.podcasts.push({
                    uniqueId: row.uniqueId,
                    title: parseTitle(row.topicName),
                    question: row.question || null,
                    answer: row.answer || null,
                    driveLink: pEntry?.driveLink || null,
                    driveId: pEntry?.driveId || null,
                });

            } else if (qType === 'crossword') {
                doc.crosswords.push({
                    uniqueId: row.uniqueId,
                    title: parseTitle(row.topicName),
                    question: row.question || null,
                    answer: null,
                });

            } else if (qType === 'meme') {
                const mEntry = memeLog.get(String(row.uniqueId));
                doc.memes.push({
                    uniqueId: row.uniqueId,
                    title: parseTitle(row.topicName),
                    question: row.question || null,
                    answer: null,
                    files: mEntry?.driveFiles || [],
                });

            } else if (qType === 'gridlock') {
                doc.gridlocks.push({
                    uniqueId: row.uniqueId,
                    title: parseTitle(row.topicName),
                    question: row.question || null,
                    answer: null,
                });
            }
            // unknown types are silently skipped
        }
    }

    // ── Upsert into MongoDB ───────────────────────────────────────────────────
    const docs = [...docsMap.values()];
    console.log(`\nTotal chapters to upsert: ${docs.length}`);

    const ops = docs.map((doc) => ({
        updateOne: {
            filter: { _id: doc._id },
            update: { $set: doc },
            upsert: true,
        },
    }));

    const result = await ChapterResource.bulkWrite(ops, { ordered: false });
    console.log(`\nBulkWrite result:`);
    console.log(`  Upserted: ${result.upsertedCount}`);
    console.log(`  Modified: ${result.modifiedCount}`);
    console.log(`  Matched:  ${result.matchedCount}`);

    // ── Verification summary ──────────────────────────────────────────────────
    const total = await ChapterResource.countDocuments();
    const withNotes = await ChapterResource.countDocuments({ 'notes.mode': { $ne: null } });
    const bySubject = await ChapterResource.aggregate([
        { $group: { _id: '$subject', count: { $sum: 1 }, withNotes: { $sum: { $cond: [{ $ne: ['$notes.mode', null] }, 1, 0] } } } }
    ]);

    console.log(`\n── Verification ──────────────────────────`);
    console.log(`Total ChapterResource docs: ${total}`);
    console.log(`Docs with notes migrated:   ${withNotes}`);
    console.log('By subject:');
    bySubject.forEach((s) => console.log(`  ${s._id}: ${s.count} chapters, ${s.withNotes} with notes`));

    await mongoose.disconnect();
    console.log('\nDone!');
};

main().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
