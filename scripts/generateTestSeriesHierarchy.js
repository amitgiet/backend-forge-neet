require('dotenv').config();
const mongoose = require('mongoose');
const MockTest = require('../src/models/MockTest');
const TestSeriesSubject = require('../src/models/TestSeriesSubject');
const TestSeriesChapter = require('../src/models/TestSeriesChapter');
const TestSeriesTopic = require('../src/models/TestSeriesTopic');

console.log('--- TEST SERIES HIERARCHY GENERATOR ---');

async function run() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const mockTests = await MockTest.find({});
    console.log(`🔍 Found ${mockTests.length} MockTest records to process`);

    let subjectsCreated = 0;
    let chaptersCreated = 0;
    let topicsCreated = 0;
    let testsUpdated = 0;

    for (const test of mockTests) {
        const { taxonomy } = test;
        if (!taxonomy) continue;

        const subjectIds = [];
        const chapterIds = [];
        const topicIds = [];

        // Process Subjects
        const subjectNames = Array.isArray(taxonomy.subjectNames) ? taxonomy.subjectNames : [];
        for (const sName of subjectNames) {
            if (!sName) continue;
            let sub = await TestSeriesSubject.findOne({ name: sName });
            if (!sub) {
                sub = await TestSeriesSubject.create({ name: sName });
                subjectsCreated++;
                console.log(`  [+] Subject created: ${sName}`);
            }
            subjectIds.push(sub._id);
        }

        // Process Chapters (linked to first subject for now, as taxonomy doesn't specify mapping)
        // In many cases, it's safer to link to all subjects found if it's a multi-subject test,
        // but the model expects exactly one subjectId per chapter.
        // We'll pick the first subject or 'Mixed / General' if multiple.
        let primarySubjectId = subjectIds[0];
        if (subjectIds.length > 1) {
            const mixed = await TestSeriesSubject.findOneAndUpdate(
                { name: 'Mixed / General' },
                { name: 'Mixed / General' },
                { upsert: true, new: true }
            );
            primarySubjectId = mixed._id;
        }

        const chapterNames = Array.isArray(taxonomy.chapterNames) ? taxonomy.chapterNames : [];
        for (const cName of chapterNames) {
            if (!cName || !primarySubjectId) continue;
            let chap = await TestSeriesChapter.findOne({ name: cName, subjectId: primarySubjectId });
            if (!chap) {
                chap = await TestSeriesChapter.create({ name: cName, subjectId: primarySubjectId });
                chaptersCreated++;
                console.log(`  [+] Chapter created: ${cName} (Subject: ${primarySubjectId})`);
            }
            chapterIds.push(chap._id);
        }

        // Process Topics (linked to first chapter)
        const topicNames = Array.isArray(taxonomy.topicNames) ? taxonomy.topicNames : [];
        let primaryChapterId = chapterIds[0];
        for (const tName of topicNames) {
            if (!tName || !primaryChapterId) continue;
            let top = await TestSeriesTopic.findOne({ name: tName, chapterId: primaryChapterId });
            if (!top) {
                top = await TestSeriesTopic.create({ name: tName, chapterId: primaryChapterId });
                topicsCreated++;
                console.log(`  [+] Topic created: ${tName} (Chapter: ${primaryChapterId})`);
            }
            topicIds.push(top._id);
        }

        // Update MockTest details
        await MockTest.updateOne(
            { _id: test._id },
            {
                $set: {
                    'testSeriesDetails.subjectIds': subjectIds,
                    'testSeriesDetails.chapterIds': chapterIds,
                    'testSeriesDetails.topicIds': topicIds
                }
            }
        );
        testsUpdated++;
    }

    console.log('\nLegendary Sync Complete! 🚀');
    console.log(`Subjects Created: ${subjectsCreated}`);
    console.log(`Chapters Created: ${chaptersCreated}`);
    console.log(`Topics Created: ${topicsCreated}`);
    console.log(`Tests Updated: ${testsUpdated}`);

    await mongoose.disconnect();
    process.exit(0);
}

run().catch(err => {
    console.error('❌ Sync failed:', err);
    process.exit(1);
});
