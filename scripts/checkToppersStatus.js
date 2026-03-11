require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const ImportedCurriculum = require('../src/models/ImportedCurriculum');

const FOLDER_PATH = path.join(__dirname, '../uploads/Topperessentials');

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected.\n');

    const chapterFolders = fs.readdirSync(FOLDER_PATH)
        .filter(f => fs.lstatSync(path.join(FOLDER_PATH, f)).isDirectory());

    console.log(`=== Toppers Essentials Upload Status (${chapterFolders.length} local folders) ===\n`);

    let uploaded = 0, partial = 0, missing = 0, notInDb = 0;

    for (const chapterId of chapterFolders) {
        const chapterDoc = await ImportedCurriculum.findOne({ _id: chapterId });
        if (!chapterDoc) {
            console.log(`❌ NOT IN DB: ${chapterId}`);
            notInDb++;
            continue;
        }
        const te = chapterDoc.toppersEssentials || {};
        const localFiles = fs.readdirSync(path.join(FOLDER_PATH, chapterId))
            .filter(f => fs.lstatSync(path.join(FOLDER_PATH, chapterId, f)).isFile());

        const uploadedFields = [];
        const missingFields = [];

        // Check each local file
        for (const file of localFiles) {
            const base = file.split('.')[0].toLowerCase();
            let isUploaded = false;
            if (base === 'audio') isUploaded = !!te.audio;
            else if (base === 'video') isUploaded = !!te.video?.url;
            else if (base === 'slides') isUploaded = !!te.slidesdeck?.url;
            else if (base === 'infographic') isUploaded = !!te.infographic;
            else if (base === 'report') isUploaded = !!te.report?.url;
            else if (base === 'mindmap') isUploaded = !!te.mindmap;
            else if (base === 'flashcards') isUploaded = !!te.flashcards?.url;

            if (isUploaded) uploadedFields.push(file);
            else missingFields.push(file);
        }

        // Extra: also show what's in DB but not locally
        const icon = missingFields.length === 0 ? '✅' : uploadedFields.length === 0 ? '⛔' : '⚠️';
        const status = missingFields.length === 0 ? 'COMPLETE' : uploadedFields.length === 0 ? 'NOT UPLOADED' : 'PARTIAL';

        console.log(`${icon} ${chapterId} [${status}]`);
        if (uploadedFields.length) console.log(`   Uploaded : ${uploadedFields.join(', ')}`);
        if (missingFields.length) console.log(`   Missing  : ${missingFields.join(', ')}`);
        console.log();

        if (missingFields.length === 0) uploaded++;
        else if (uploadedFields.length > 0) partial++;
        else missing++;
    }

    console.log('=== SUMMARY ===');
    console.log(`✅ Fully uploaded : ${uploaded}`);
    console.log(`⚠️  Partial       : ${partial}`);
    console.log(`⛔ Not uploaded   : ${missing}`);
    console.log(`❌ Not in DB      : ${notInDb}`);

    await mongoose.disconnect();
    process.exit(0);
};

run().catch(err => { console.error(err); process.exit(1); });
