/**
 * finalImageAudit.js
 * 
 * Compares the first error log against the current DB state.
 * Generates a clean q-images-FINAL-MISSING.jsonl file.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ImportedQuestion = require('../src/models/ImportedQuestion');

const ERROR_FILE = 'scripts/logs/q-images-errors-2026-03-25T09-04-20-083Z.jsonl';
const FINAL_FILE = 'scripts/logs/q-images-FINAL-MISSING.jsonl';

async function audit() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const lines = fs.readFileSync(path.resolve(ERROR_FILE), 'utf8').split('\n').filter(Boolean);
    const missingItems = [];
    let resolved = 0;

    console.log(`Auditing ${lines.length} previous errors...`);

    for (const line of lines) {
        const item = JSON.parse(line);
        // If question with this imageId now has a URL, it was recovered
        const exists = await ImportedQuestion.findOne({ 
            imageId: item.imageId, 
            imageUrl: { $ne: null } 
        });
        
        if (!exists) {
            missingItems.push(line);
        } else {
            resolved++;
        }
    }

    fs.writeFileSync(path.resolve(FINAL_FILE), missingItems.join('\n') + '\n');
    
    console.log('\n--- AUDIT COMPLETE ---');
    console.log(`Original errors   : ${lines.length}`);
    console.log(`Recovered         : ${resolved}`);
    console.log(`ACTUALLY MISSING  : ${missingItems.length}`);
    console.log(`Saved to          : ${FINAL_FILE}`);
    
    process.exit(0);
}

audit().catch(err => { console.error(err); process.exit(1); });
