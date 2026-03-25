/**
 * syncQuestionsFromJson.js
 * 
 * Synchronizes the ImportedQuestion collection with the original JSON source file
 * (uploads/NEETforge_Clean_1774359216247.json).
 * 
 * This fixes:
 *  1. imageId field (from "image_id" in JSON)
 *  2. subject field (parsed from "chapter" tag in JSON)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Adjust require path for script location
const ImportedQuestion = require('../src/models/ImportedQuestion');

async function sync() {
    const JSON_PATH = 'uploads/NEETforge_Clean_1774359216247.json';
    if (!fs.existsSync(JSON_PATH)) {
        console.error('JSON source file not found!');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    console.log('Loading JSON (37MB)... This may take 10-20 seconds.');
    const rawData = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    console.log('JSON Loaded.');

    const bulkOps = [];
    let count = 0;

    for (const qId in rawData) {
        const item = rawData[qId];
        const data = item.data || {};
        
        // Extract correct subject from the chapter string or label
        let subject = 'biology'; // default
        const chapterStr = (data.chapter || '').toLowerCase();
        if (chapterStr.includes('physics')) subject = 'physics';
        else if (chapterStr.includes('chemistry')) subject = 'chemistry';

        // Extract imageId
        const imageId = item.image_id || null;

        bulkOps.push({
            updateMany: {
                filter: { questionId: qId },
                update: { $set: { subject, imageId } }
            }
        });

        count++;
        if (bulkOps.length >= 2000) {
            console.log(`Synced ${count} questions...`);
            await ImportedQuestion.bulkWrite(bulkOps);
            bulkOps.length = 0;
        }
    }

    if (bulkOps.length > 0) {
        await ImportedQuestion.bulkWrite(bulkOps);
    }

    console.log(`\n✅ Synchronization complete! Total questions updated: ${count}`);
    await mongoose.disconnect();
}

sync().catch(err => { console.error(err); process.exit(1); });
