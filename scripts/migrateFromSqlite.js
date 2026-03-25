require('dotenv').config();
const mongoose = require('mongoose');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const ImportedQuestion = require('../src/models/ImportedQuestion');

const DB_FILES = [
    { file: 'biology_questions.db', tables: [{ name: 'biology', subject: 'biology', lang: 'en' }, { name: 'biologyHindi', subject: 'biology', lang: 'hi' }] },
    { file: 'chemistry_questions.db', tables: [{ name: 'chemistry', subject: 'chemistry', lang: 'en' }, { name: 'chemistryHindi', subject: 'chemistry', lang: 'hi' }] },
    { file: 'physics_questions.db', tables: [{ name: 'physics', subject: 'physics', lang: 'en' }, { name: 'physicsHindi', subject: 'physics', lang: 'hi' }] },
    { file: 'npcm_phy_database.db', tables: [{ name: 'npcmPhy', subject: 'physics', lang: 'en' }] },
    { file: 'npcm_bio_database.db', tables: [{ name: 'npcmBio', subject: 'biology', lang: 'en' }] },
    { file: 'npcm_chem_database.db', tables: [{ name: 'npcmChem', subject: 'chemistry', lang: 'en' }] }
];

// User requested raw data migration without text modification
function extractImageIds(text, quizType) {
    if (!text) return { cleanedText: '', imageIds: [] };
    
    // We do NOT modify the text per user request. 
    // We only attempt to extract single words for imageIds IF the entire question is literally just the ID (e.g. video IDs)
    const trimmed = String(text).trim();
    const imageIds = [];
    
    if (quizType === 'video' || quizType === 'image' || quizType === 'notes') {
        const words = trimmed.split(/[\s,]+/);
        if (words.length === 1 && trimmed.length >= 5 && trimmed.length <= 15) {
            imageIds.push(trimmed);
        }
    }

    return { cleanedText: text, imageIds };
}

function extractOptionLetter(answer, r) {
    if (!answer) return null;
    const ansLower = answer.trim().toLowerCase();

    // Sometimes answer contains exactly Option A, B, C, D text
    if (r.optionA && ansLower === r.optionA.trim().toLowerCase()) return 'A';
    if (r.optionB && ansLower === r.optionB.trim().toLowerCase()) return 'B';
    if (r.optionC && ansLower === r.optionC.trim().toLowerCase()) return 'C';
    if (r.optionD && ansLower === r.optionD.trim().toLowerCase()) return 'D';

    // Also try checking if the answer string explicitly calls out the letter
    if (/^[A-D]\b/i.test(ansLower)) {
        return ansLower[0].toUpperCase();
    }

    return null;
}

function processDifficulty(diff) {
    const val = parseInt(diff, 10);
    if (val === 1) return 'easy';
    if (val === 2) return 'medium';
    if (val === 3) return 'hard';
    return null;
}

function mapQuizType(quizType) {
    if (!quizType) return { type: 'mcq', isSupported: true };
    const cleanType = String(quizType).trim().toLowerCase();

    if (cleanType.includes('video') || cleanType === 'वीडियो') {
        return { type: 'video', isSupported: true };
    }

    const valid = ['mcq', 'fillup', 'match', 'order', 'flashcard', 'video', 'fill-blank', 'diagram-label', 'numeric', 'notes', 'image'];

    if (valid.includes(cleanType)) return { type: cleanType, isSupported: true };

    return { type: 'mcq', isSupported: false, reason: `Unsupported quiz type: ${quizType}` };
}

const taxonomyMap = new Map();

async function loadTaxonomy() {
    return new Promise((resolve) => {
        const fullPath = path.join(__dirname, '..', 'uploads', 'subject_cache.db');
        const db = new sqlite3.Database(fullPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) return resolve();
        });

        const query = `
            SELECT 
              u.uid, 
              s.name as subTopic, 
              t.name as topic, 
              c.id as chapterId, 
              sub.name as subjectName
            FROM uids u
            JOIN subtopics s ON u.subtopic_id = s.id
            JOIN topics t ON s.topic_id = t.id
            JOIN chapters c ON t.chapter_id = c.id
            JOIN subjects sub ON c.subject_id = sub.id
        `;

        db.all(query, [], (err, rows) => {
            db.close();
            if (!err && rows) {
                for (const row of rows) {
                    const uidStr = String(row.uid);
                    if (!taxonomyMap.has(uidStr)) taxonomyMap.set(uidStr, []);
                    taxonomyMap.get(uidStr).push({
                        subject: String(row.subjectName).toLowerCase(),
                        chapterId: String(row.chapterId),
                        topic: row.topic,
                        subTopic: row.subTopic
                    });
                }
            }
            resolve();
        });
    });
}

function fetchTableData(dbPath, tableInfo) {
    return new Promise((resolve, reject) => {
        const fullPath = path.join(__dirname, '..', 'uploads', dbPath);
        const db = new sqlite3.Database(fullPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) return resolve([]);
        });

        db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [tableInfo.name], (err, row) => {
            if (err || !row) {
                db.close();
                return resolve([]);
            }

            db.all(`SELECT * FROM ${tableInfo.name}`, [], (err, rows) => {
                db.close();
                if (err) return resolve([]);

                    resolve(rows.map(r => {
                        const { cleanedText: qClean, imageIds: qImages } = extractImageIds(r.question || '', r.quizType);
                        const { cleanedText: eClean, imageIds: eImages } = extractImageIds(r.explanation || '', r.quizType);

                    const allImages = [...qImages, ...eImages];
                    
                    // We only use the SQLite imageId column directly if present, OR the fallback we detected
                    let finalImageId = null;
                    if (r.imageId && String(r.imageId).trim() !== '') {
                        finalImageId = String(r.imageId).trim();
                    } else if (allImages.length > 0) {
                        finalImageId = allImages[0];
                    }

                    const typeMapping = mapQuizType(r.quizType);

                    const uidStr = String(r.uniqueId);
                    const taxList = taxonomyMap.get(uidStr) || [];
                    const tax = taxList.find(t => t.subject === tableInfo.subject) || {};

                    return {
                        questionId: uidStr,
                        subject: tableInfo.subject,
                        language: tableInfo.lang,
                        question: qClean,
                        correct_answer: r.answer || '',
                        correct_option: extractOptionLetter(r.answer, r),
                        explanation: eClean,
                        options: {
                            A: r.optionA || null,
                            B: r.optionB || null,
                            C: r.optionC || null,
                            D: r.optionD || null
                        },
                        source: r.topicName || '',
                        chapterId: tax.chapterId || null,
                        topic: tax.topic || null,
                        subTopic: tax.subTopic || null,
                        difficulty: processDifficulty(r.difficultyLevel),
                        type: typeMapping.type,
                        isSupported: typeMapping.isSupported,
                        unsupportedReason: typeMapping.reason || null,
                        status: r.syllabusUpdate === 'NULL' ? null : r.syllabusUpdate,
                        chapter_start: r.ncert22Page && r.ncert22Page !== 'None' ? String(r.ncert22Page) : null,
                        chapter_end: r.ncert23Page && r.ncert23Page !== 'None' ? String(r.ncert23Page) : null,
                        imageId: finalImageId,
                        isActive: true
                    };
                }));
            });
        });
    });
}

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB.');

        console.log('--- LOADING TAXONOMY CACHE ---');
        await loadTaxonomy();
        console.log(`Taxonomy mapped for ${taxonomyMap.size} unique IDs.`);

        console.log('\n--- PHASE 7: EXECUTING MIGRATION ---');
        console.log('⚠️ WIPING EXISTING ImportedQuestion COLLECTION ⚠️');
        await ImportedQuestion.deleteMany({});
        console.log('Wipe complete. Collection is empty.\n');

        let totalInserted = 0;
        const failedChunks = [];

        for (const dbConfig of DB_FILES) {
            console.log(`Processing DB: ${dbConfig.file}`);

            for (const tableInfo of dbConfig.tables) {
                console.log(`  -> Reading table: ${tableInfo.name} (${tableInfo.subject}/${tableInfo.lang})`);
                const rows = await fetchTableData(dbConfig.file, tableInfo);

                if (rows.length === 0) {
                    console.log(`     (No records found or table missing)`);
                    continue;
                }

                console.log(`     Found ${rows.length} rows. Starting bulk insert...`);
                let successCount = 0;
                const chunkSize = 1000; // Smaller chunk for safer insertion

                for (let i = 0; i < rows.length; i += chunkSize) {
                    const chunk = rows.slice(i, i + chunkSize);
                    try {
                        await ImportedQuestion.insertMany(chunk, { ordered: false });
                        successCount += chunk.length;
                    } catch (err) {
                        // Ordered: false means it inserts all it can and throws BulkWriteError for the rest
                        console.error(`\n     ❌ Partial error in chunk (${i} to ${i + chunkSize}): ${err.message}`);
                        // Determine how many actually succeeded
                        if (err.insertedDocs) {
                            successCount += err.insertedDocs.length;
                        }
                    }

                    // Progress logging
                    process.stdout.write(`\r     Progress: ${Math.min(i + chunkSize, rows.length)} / ${rows.length}`);
                }

                totalInserted += successCount;
                console.log(`\n     ✅ Successfully ingested ${successCount} records.\n`);
            }
        }

        console.log(`\n🎉 PHASE 7 COMPLETE 🎉`);
        console.log(`Grand Total Questions Imported: ${totalInserted}`);
        process.exit(0);
    } catch (error) {
        console.error('\n💥 FATAL MIGRATION CRASH 💥\n', error);
        process.exit(1);
    }
}

migrate();
