require('dotenv').config();
const mongoose = require('mongoose');
const TestSeriesSubject = require('../src/models/TestSeriesSubject');
const TestSeriesChapter = require('../src/models/TestSeriesChapter');
const TestSeriesTopic = require('../src/models/TestSeriesTopic');
const MockTest = require('../src/models/MockTest');
const MockTestTaxonomyMap = require('../src/models/MockTestTaxonomyMap');

const normalize = (value) =>
    String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const uniqueObjectIds = (ids = []) => {
    const seen = new Set();
    const out = [];
    for (const id of ids) {
        const key = String(id);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(id);
    }
    return out;
};

async function rewireMockTestChapterRefs(oldChapterId, newChapterId) {
    const rows = await MockTest.find({
        $or: [
            { 'testSeriesDetails.chapterIds': oldChapterId },
            { 'facets.chapterIds': oldChapterId }
        ]
    }).lean();

    let updated = 0;
    for (const row of rows) {
        const chapterIds = Array.isArray(row.testSeriesDetails?.chapterIds) ? row.testSeriesDetails.chapterIds : [];
        const nextChapterIds = uniqueObjectIds(
            chapterIds.map((id) => (String(id) === String(oldChapterId) ? newChapterId : id))
        );

        const facetChapterIds = Array.isArray(row.facets?.chapterIds) ? row.facets.chapterIds : [];
        const nextFacetChapterIds = uniqueObjectIds(
            facetChapterIds.map((id) => (String(id) === String(oldChapterId) ? newChapterId : id))
        );

        await MockTest.updateOne(
            { _id: row._id },
            {
                $set: {
                    'testSeriesDetails.chapterIds': nextChapterIds,
                    'facets.chapterIds': nextFacetChapterIds
                }
            }
        );
        updated += 1;
    }

    return updated;
}

async function rewireMockTestTopicRefs(oldTopicId, newTopicId) {
    const rows = await MockTest.find({
        $or: [
            { 'testSeriesDetails.topicIds': oldTopicId },
            { 'facets.topicIds': oldTopicId }
        ]
    }).lean();

    let updated = 0;
    for (const row of rows) {
        const topicIds = Array.isArray(row.testSeriesDetails?.topicIds) ? row.testSeriesDetails.topicIds : [];
        const nextTopicIds = uniqueObjectIds(
            topicIds.map((id) => (String(id) === String(oldTopicId) ? newTopicId : id))
        );

        const facetTopicIds = Array.isArray(row.facets?.topicIds) ? row.facets.topicIds : [];
        const nextFacetTopicIds = uniqueObjectIds(
            facetTopicIds.map((id) => (String(id) === String(oldTopicId) ? newTopicId : id))
        );

        await MockTest.updateOne(
            { _id: row._id },
            {
                $set: {
                    'testSeriesDetails.topicIds': nextTopicIds,
                    'facets.topicIds': nextFacetTopicIds
                }
            }
        );
        updated += 1;
    }

    return updated;
}

async function migrateMapChapter(oldChapterId, newChapterId) {
    const rows = await MockTestTaxonomyMap.find({ chapterId: oldChapterId });
    let moved = 0;
    let removed = 0;

    for (const row of rows) {
        const exists = await MockTestTaxonomyMap.findOne({
            testId: row.testId,
            subjectId: row.subjectId || null,
            chapterId: newChapterId,
            topicId: row.topicId || null
        }).lean();

        if (exists) {
            await MockTestTaxonomyMap.deleteOne({ _id: row._id });
            removed += 1;
        } else {
            row.chapterId = newChapterId;
            await row.save();
            moved += 1;
        }
    }

    return { moved, removed };
}

async function migrateTopics(oldChapterId, newChapterId) {
    const topics = await TestSeriesTopic.find({ chapterId: oldChapterId });
    let moved = 0;
    let merged = 0;

    for (const topic of topics) {
        const normalizedName = normalize(topic.name);
        let existing = await TestSeriesTopic.findOne({ chapterId: newChapterId, normalizedName });
        if (!existing) {
            existing = await TestSeriesTopic.findOne({ chapterId: newChapterId, name: topic.name });
        }

        if (existing) {
            await MockTestTaxonomyMap.updateMany(
                { topicId: topic._id },
                { $set: { topicId: existing._id, chapterId: newChapterId } }
            );
            await rewireMockTestTopicRefs(topic._id, existing._id);
            await TestSeriesTopic.deleteOne({ _id: topic._id });
            merged += 1;
        } else {
            topic.chapterId = newChapterId;
            await topic.save();
            await MockTestTaxonomyMap.updateMany(
                { topicId: topic._id },
                { $set: { chapterId: newChapterId } }
            );
            moved += 1;
        }
    }

    return { moved, merged };
}

async function run() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing');
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const mixedSubject = await TestSeriesSubject.findOne({ name: 'Mixed / General' }).lean();
    if (!mixedSubject) {
        console.log('No "Mixed / General" subject found. Nothing to clean.');
        await mongoose.disconnect();
        return;
    }
    const mixedId = String(mixedSubject._id);

    const chapters = await TestSeriesChapter.find({}).lean();
    const groups = new Map();

    for (const chapter of chapters) {
        const key = `${normalize(chapter.name)}|${Number.isFinite(chapter.originalId) ? chapter.originalId : 'na'}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(chapter);
    }

    const candidateGroups = [...groups.values()].filter((items) => {
        if (items.length < 2) return false;
        const hasMixed = items.some((x) => String(x.subjectId) === mixedId);
        const hasSpecific = items.some((x) => String(x.subjectId) !== mixedId);
        return hasMixed && hasSpecific;
    });

    let chaptersDeleted = 0;
    let chapterRefsUpdated = 0;
    let mapMoved = 0;
    let mapRemoved = 0;
    let topicsMoved = 0;
    let topicsMerged = 0;

    for (const items of candidateGroups) {
        const specificItems = items
            .filter((x) => String(x.subjectId) !== mixedId)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        if (!specificItems.length) continue;

        const canonical = specificItems[0];
        const mixedItems = items.filter((x) => String(x.subjectId) === mixedId);

        for (const mixed of mixedItems) {
            const oldChapterId = new mongoose.Types.ObjectId(mixed._id);
            const newChapterId = new mongoose.Types.ObjectId(canonical._id);

            chapterRefsUpdated += await rewireMockTestChapterRefs(oldChapterId, newChapterId);

            const mapResult = await migrateMapChapter(oldChapterId, newChapterId);
            mapMoved += mapResult.moved;
            mapRemoved += mapResult.removed;

            const topicResult = await migrateTopics(oldChapterId, newChapterId);
            topicsMoved += topicResult.moved;
            topicsMerged += topicResult.merged;

            await TestSeriesChapter.deleteOne({ _id: oldChapterId });
            chaptersDeleted += 1;
        }
    }

    console.log('Mixed/General duplicate cleanup complete');
    console.log({
        candidateGroups: candidateGroups.length,
        chaptersDeleted,
        chapterRefsUpdated,
        mapMoved,
        mapRemoved,
        topicsMoved,
        topicsMerged
    });

    await mongoose.disconnect();
}

run().catch(async (error) => {
    console.error('Cleanup failed:', error.message);
    try {
        await mongoose.disconnect();
    } catch (e) {}
    process.exit(1);
});
