require('dotenv').config();
const mongoose = require('mongoose');
const MockTest = require('../src/models/MockTest');
const TestSeriesChapter = require('../src/models/TestSeriesChapter');

const normalize = (value) =>
    String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const addPair = (nameToIds, chapterName, chapterId) => {
    const key = normalize(chapterName);
    const id = Number(chapterId);
    if (!key || !Number.isFinite(id)) return;
    if (!nameToIds.has(key)) nameToIds.set(key, new Set());
    nameToIds.get(key).add(id);
};

async function run() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing');
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const tests = await MockTest.find({}, { taxonomy: 1, source: 1 }).lean();
    const nameToIds = new Map();

    for (const test of tests) {
        const taxonomy = test.taxonomy || {};
        const chapterNames = Array.isArray(taxonomy.chapterNames) ? taxonomy.chapterNames : [];
        const chapterIds = Array.isArray(taxonomy.chapterIds) ? taxonomy.chapterIds : [];
        for (let i = 0; i < chapterNames.length; i += 1) {
            addPair(nameToIds, chapterNames[i], chapterIds[i]);
        }

        const raw = test.source?.raw || {};
        const rawChapterNames = Array.isArray(raw.chapterNames) ? raw.chapterNames : [];
        const rawChapterIds = Array.isArray(raw.chapterIds) ? raw.chapterIds : [];
        for (let i = 0; i < rawChapterNames.length; i += 1) {
            addPair(nameToIds, rawChapterNames[i], rawChapterIds[i]);
        }
    }

    const missing = await TestSeriesChapter.find(
        { $or: [{ originalId: { $exists: false } }, { originalId: null }] },
        { name: 1, originalId: 1 }
    );

    let updated = 0;
    let unresolved = 0;
    let ambiguous = 0;

    for (const chapter of missing) {
        const key = normalize(chapter.name);
        const candidateSet = nameToIds.get(key);
        if (!candidateSet || candidateSet.size === 0) {
            unresolved += 1;
            continue;
        }
        if (candidateSet.size > 1) {
            ambiguous += 1;
            continue;
        }

        const [resolvedId] = [...candidateSet];
        chapter.originalId = resolvedId;
        await chapter.save();
        updated += 1;
    }

    const remainingMissing = await TestSeriesChapter.countDocuments({
        $or: [{ originalId: { $exists: false } }, { originalId: null }]
    });

    console.log('Backfill complete');
    console.log({ updated, unresolved, ambiguous, remainingMissing });

    await mongoose.disconnect();
}

run().catch(async (error) => {
    console.error('Backfill failed:', error.message);
    try {
        await mongoose.disconnect();
    } catch (e) {}
    process.exit(1);
});

