const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Load env directly since this might run isolated initially
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const MockTest = require('../src/models/MockTest');
const TestSeriesSubject = require('../src/models/TestSeriesSubject');
const TestSeriesChapter = require('../src/models/TestSeriesChapter');
const TEST_SERIES_FILE = path.join(__dirname, '../uploads/TestSeries.json');

const ImportedCurriculum = require('../src/models/ImportedCurriculum');

async function buildChapterSubjectMap() {
    console.log('Building chapter-to-subject map from ImportedCurriculum...');
    const map = new Map();

    // Some are stored as chapter (_id), some as topic
    const docs = await ImportedCurriculum.find({}, '_id subject topics').lean();

    for (const doc of docs) {
        // Map by chapter name (which is _id in ImportedCurriculum)
        if (doc._id) {
            map.set(doc._id.toLowerCase().trim(), doc.subject.toLowerCase().trim());
        }

        // Also map by topic names, as TestSeries sometimes uses topic names as chapters
        if (doc.topics && Array.isArray(doc.topics)) {
            for (const t of doc.topics) {
                if (t.topic) {
                    map.set(t.topic.toLowerCase().trim(), doc.subject.toLowerCase().trim());
                }
            }
        }
    }

    return map;
}

async function importTestSeries() {
    try {
        console.log('Connecting to MongoDB...', process.env.MONGODB_URI);
        await mongoose.connect(process.env.MONGODB_URI);

        console.log('Reading TestSeries.json...');
        const data = JSON.parse(fs.readFileSync(TEST_SERIES_FILE, 'utf8'));
        const testSeries = data.testSeries || [];

        console.log(`Found ${testSeries.length} tests to import.`);

        const curriculumMap = await buildChapterSubjectMap();

        let testsUpdated = 0;
        let testsInserted = 0;

        for (const test of testSeries) {
            // 1. Process Subjects
            const subjectDocIds = [];
            for (const subjName of (test.subjectNames || [])) {
                const doc = await TestSeriesSubject.findOneAndUpdate(
                    { name: subjName },
                    { name: subjName },
                    { upsert: true, new: true }
                );
                subjectDocIds.push(doc._id);
            }

            // 2. Process Chapters
            // The JSON has `chapterNames` and `chapterIds` arrays, hopefully 1:1 mapped
            const chapterDocIds = [];
            const cNames = test.chapterNames || [];
            const cIds = test.chapterIds || [];

            // Since subjects aren't rigidly mapped to chapters here out-of-the-box, 
            // we'll attempt to link chapters to the first available subject if no other logic applies.
            // Often, a test targets a specific domain (like "Biology").
            // If a test targets exactly 1 subject, we know all chapters belong to it.
            // If multiple, we might safely assume an ID placeholder for now or assign it to a "Mixed" category. 
            // For maximal correctness, we will just assign it to the primary subject listed or create a mapping fallback.

            let primarySubjectId = subjectDocIds[0] || null;

            // Create generic placeholder if missing
            const fallback = await TestSeriesSubject.findOneAndUpdate(
                { name: "Mixed / General" }, { name: "Mixed / General" }, { upsert: true, new: true }
            );

            // Create a lookup for subject name -> TestSeriesSubject._id
            const subjectDocIdMap = new Map();
            for (const subjName of (test.subjectNames || [])) {
                const doc = await TestSeriesSubject.findOne({ name: subjName });
                if (doc) subjectDocIdMap.set(subjName.toLowerCase(), doc._id);
            }

            // Also load standard Physics/Chemistry/Biology subjects just in case the test didn't explicitly list them
            // but a chapter belongs to them
            const stdSubjects = await TestSeriesSubject.find({
                name: { $in: ['Physics', 'Chemistry', 'Biology', 'physics', 'chemistry', 'biology'] }
            });
            for (const s of stdSubjects) {
                subjectDocIdMap.set(s.name.toLowerCase(), s._id);
            }

            for (let i = 0; i < cNames.length; i++) {
                const cName = cNames[i];
                const cOriginalId = cIds[i] || null;

                // Determine subject for this chapter
                let chapterSubjectId = fallback._id;
                const normalizedName = cName.toLowerCase().trim();

                // 1. Check if curriculum map knows it
                if (curriculumMap.has(normalizedName)) {
                    const mappedSubjectName = curriculumMap.get(normalizedName);
                    if (subjectDocIdMap.has(mappedSubjectName)) {
                        chapterSubjectId = subjectDocIdMap.get(mappedSubjectName);
                    }
                }
                // 2. Fallback to primary subject if it's a single-subject test
                else if (test.subjectNames && test.subjectNames.length === 1 && subjectDocIdMap.has(test.subjectNames[0].toLowerCase())) {
                    chapterSubjectId = subjectDocIdMap.get(test.subjectNames[0].toLowerCase());
                }

                // Try to see if this chapter already exists across ANY subject to avoid duplicates mapped to the wrong subject
                let chapterDoc = await TestSeriesChapter.findOne({ name: cName });

                if (!chapterDoc) {
                    chapterDoc = await TestSeriesChapter.create({
                        name: cName,
                        originalId: cOriginalId,
                        subjectId: chapterSubjectId
                    });
                } else if (chapterDoc.subjectId.toString() !== chapterSubjectId.toString() && chapterSubjectId.toString() !== fallback._id.toString()) {
                    // Update to correct subject if it was previously wrong and we have a better one now
                    if (chapterDoc.subjectId.toString() === fallback._id.toString()) {
                        chapterDoc.subjectId = chapterSubjectId;
                        await chapterDoc.save();
                    }
                }

                chapterDocIds.push(chapterDoc._id);
            }

            // 3. Process Topics
            const topicDocIds = [];
            const topicMap = test.chapterTopicsMap || {};

            for (const [cOriginalIdKey, topicsArray] of Object.entries(topicMap)) {
                // Find the MongoDB Chapter ID for this original ID mapped above
                // Note: multiple chapters might share an originalId across databases, but we look for it specifically
                const chapterDoc = await TestSeriesChapter.findOne({ originalId: parseInt(cOriginalIdKey) }) || await TestSeriesChapter.findOne();
                if (!chapterDoc) continue;

                for (const tName of topicsArray) {
                    const topicDoc = await TestSeriesTopic.findOneAndUpdate(
                        { name: tName, chapterId: chapterDoc._id },
                        { name: tName, chapterId: chapterDoc._id },
                        { upsert: true, new: true }
                    );
                    topicDocIds.push(topicDoc._id);
                }
            }

            // 4. Upsert the MockTest
            const mockTestData = {
                testId: test.id,
                title: { en: test.title },
                examType: 'NEET_UG',
                testType: 'FULL_TEST', // Default fallback
                config: {
                    totalQuestions: test.numberOfQuestions,
                    totalMarks: test.numberOfQuestions * 4,
                    duration: test.timeLimit
                },
                accessType: test.isLocked ? 'PRO' : 'FREE',
                isActive: test.status !== 'locked', // Note: status might be 'locked' or 'unlocked'
                seriesType: test.type || '',
                taxonomy: {
                    subjectNames: test.subjectNames,
                    chapterNames: test.chapterNames,
                    topicNames: test.topicNames,
                    chapterIds: test.chapterIds,
                    chapterTopicsMap: test.chapterTopicsMap
                },
                testSeriesDetails: {
                    subjectIds: subjectDocIds,
                    chapterIds: chapterDocIds,
                    topicIds: topicDocIds
                },
                source: {
                    raw: test
                },
                resources: {
                    questionPdf: test.questionPaperPdfUrl,
                    answerPdf: test.answerKeyPdfUrl
                }
            };

            const existingTest = await MockTest.findOne({ testId: test.id });
            if (existingTest) {
                await MockTest.updateOne({ testId: test.id }, { $set: mockTestData });
                testsUpdated++;
            } else {
                await MockTest.create(mockTestData);
                testsInserted++;
            }
        }

        console.log(`Success! Inserted: ${testsInserted}, Updated: ${testsUpdated}`);
    } catch (error) {
        console.error('Error importing test series:', error);
    } finally {
        mongoose.disconnect();
        console.log('MongoDB disconnected.');
    }
}

importTestSeries();
