require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const MockTest = require('../src/models/MockTest');
const TestSeries = require('../src/models/TestSeries');
const TestSeriesSubject = require('../src/models/TestSeriesSubject');
const TestSeriesChapter = require('../src/models/TestSeriesChapter');
const TestSeriesTopic = require('../src/models/TestSeriesTopic');
const MockTestTaxonomyMap = require('../src/models/MockTestTaxonomyMap');

const normalizeName = (value) =>
    String(value || '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const uniqueObjectIds = (values = []) => {
    const seen = new Set();
    const out = [];
    for (const value of values) {
        const key = String(value || '');
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(value);
    }
    return out;
};

const parseArgs = () => {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    return { dryRun };
};

const getRowsFromJson = () => {
    const filePath = path.join(__dirname, '..', 'uploads', 'TestSeries.json');
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.testSeries)) return raw.testSeries;
    return [];
};

const appendAlias = (aliases = [], value = '') => {
    const v = String(value || '').trim();
    if (!v) return aliases || [];
    const set = new Set((aliases || []).map((x) => String(x || '').trim()).filter(Boolean));
    set.add(v);
    return [...set];
};

async function upsertSeries({ name, examType = 'NEET_UG', provider = 'Custom' }) {
    if (!name) return null;
    const normalizedName = normalizeName(name);
    let series = await TestSeries.findOne({ provider, examType, language: 'en', normalizedName });
    if (!series) {
        series = await TestSeries.create({
            name,
            normalizedName,
            provider,
            examType,
            language: 'en',
            seriesType: name
        });
        return series;
    }

    const updates = {};
    if (!series.name) updates.name = name;
    if (!series.seriesType) updates.seriesType = name;
    if (Object.keys(updates).length) {
        await TestSeries.updateOne({ _id: series._id }, { $set: updates });
        Object.assign(series, updates);
    }
    return series;
}

async function upsertSubject({ name, examType = 'NEET_UG' }) {
    const normalizedName = normalizeName(name);
    let subject = await TestSeriesSubject.findOne({ examType, normalizedName });
    if (!subject) subject = await TestSeriesSubject.findOne({ name });
    if (!subject) {
        return TestSeriesSubject.create({ name, normalizedName, examType });
    }

    const updates = {};
    if (!subject.normalizedName) updates.normalizedName = normalizedName;
    const nextAliases = appendAlias(subject.aliases, name);
    if (nextAliases.length !== (subject.aliases || []).length) updates.aliases = nextAliases;
    if (Object.keys(updates).length) {
        await TestSeriesSubject.updateOne({ _id: subject._id }, { $set: updates });
        Object.assign(subject, updates);
    }
    return subject;
}

async function upsertChapter({ name, originalId, subjectId }) {
    const normalizedName = normalizeName(name);
    let chapter = null;
    if (Number.isFinite(originalId)) {
        chapter = await TestSeriesChapter.findOne({ subjectId, originalId });
    }
    if (!chapter) {
        chapter = await TestSeriesChapter.findOne({ subjectId, normalizedName });
    }
    if (!chapter) {
        chapter = await TestSeriesChapter.findOne({ subjectId, name });
    }
    if (!chapter) {
        return TestSeriesChapter.create({
            name,
            normalizedName,
            originalId: Number.isFinite(originalId) ? originalId : undefined,
            subjectId
        });
    }

    const updates = {};
    if (!chapter.normalizedName) updates.normalizedName = normalizedName;
    if (!chapter.originalId && Number.isFinite(originalId)) updates.originalId = originalId;
    const nextAliases = appendAlias(chapter.aliases, name);
    if (nextAliases.length !== (chapter.aliases || []).length) updates.aliases = nextAliases;
    if (Object.keys(updates).length) {
        await TestSeriesChapter.updateOne({ _id: chapter._id }, { $set: updates });
        Object.assign(chapter, updates);
    }
    return chapter;
}

async function upsertTopic({ name, chapterId }) {
    const normalizedName = normalizeName(name);
    let topic = await TestSeriesTopic.findOne({ chapterId, normalizedName });
    if (!topic) topic = await TestSeriesTopic.findOne({ chapterId, name });
    if (!topic) {
        return TestSeriesTopic.create({ name, normalizedName, chapterId });
    }

    const updates = {};
    if (!topic.normalizedName) updates.normalizedName = normalizedName;
    const nextAliases = appendAlias(topic.aliases, name);
    if (nextAliases.length !== (topic.aliases || []).length) updates.aliases = nextAliases;
    if (Object.keys(updates).length) {
        await TestSeriesTopic.updateOne({ _id: topic._id }, { $set: updates });
        Object.assign(topic, updates);
    }
    return topic;
}

const isSingleSubjectChapterRow = (row) => {
    const subjectNames = Array.isArray(row?.subjectNames) ? row.subjectNames.filter(Boolean) : [];
    const chapterNames = Array.isArray(row?.chapterNames) ? row.chapterNames.filter(Boolean) : [];
    const chapterIds = Array.isArray(row?.chapterIds) ? row.chapterIds.filter((v) => Number.isFinite(Number(v))) : [];
    return subjectNames.length === 1 && chapterNames.length === 1 && chapterIds.length === 1;
};

const getTopicNamesForRow = (row, chapterId) => {
    const chapterTopicsMap = row?.chapterTopicsMap && typeof row.chapterTopicsMap === 'object' ? row.chapterTopicsMap : {};
    const mappedTopics = Array.isArray(chapterTopicsMap[String(chapterId)]) ? chapterTopicsMap[String(chapterId)] : [];
    const topicNames = mappedTopics.length ? mappedTopics : (Array.isArray(row?.topicNames) ? row.topicNames : []);
    return [...new Set(topicNames.map((x) => String(x || '').trim()).filter(Boolean))];
};

async function findMockTestForExternalId(externalId) {
    return MockTest.findOne({
        $or: [
            { 'source.externalId': externalId },
            { testId: externalId }
        ]
    });
}

async function processRow(row, dryRun = false) {
    const externalId = String(row.id || '').trim();
    if (!externalId) {
        return { status: 'skipped_no_external_id' };
    }

    const subjectName = String(row.subjectNames[0] || '').trim();
    const chapterName = String(row.chapterNames[0] || '').trim();
    const sourceChapterId = Number(row.chapterIds[0]);
    const topicNames = getTopicNamesForRow(row, sourceChapterId);
    const seriesName = String(row.type || '').trim();

    const mockTest = await findMockTestForExternalId(externalId);
    if (!mockTest) {
        return { status: 'skipped_mocktest_not_found', externalId };
    }

    const examType = String(mockTest.examType || 'NEET_UG');
    const provider = String(mockTest?.source?.provider || mockTest.institution || 'Custom').trim() || 'Custom';

    const series = await upsertSeries({ name: seriesName, examType, provider });
    const subject = await upsertSubject({ name: subjectName, examType });
    const chapter = await upsertChapter({ name: chapterName, originalId: sourceChapterId, subjectId: subject._id });

    const topicDocs = [];
    for (const topicName of topicNames) {
        const topic = await upsertTopic({ name: topicName, chapterId: chapter._id });
        topicDocs.push(topic);
    }

    const subjectIds = [subject._id];
    const chapterIds = [chapter._id];
    const topicIds = uniqueObjectIds(topicDocs.map((x) => x._id));

    if (!dryRun) {
        await MockTest.updateOne(
            { _id: mockTest._id },
            {
                $set: {
                    seriesId: series?._id || null,
                    seriesType: seriesName || mockTest.seriesType || '',
                    taxonomyStatus: 'complete',
                    testSeriesDetails: { subjectIds, chapterIds, topicIds },
                    facets: { subjectIds, chapterIds, topicIds },
                    taxonomy: {
                        subjectNames: [subjectName],
                        chapterNames: [chapterName],
                        topicNames,
                        chapterIds: [sourceChapterId],
                        chapterTopicsMap: {
                            [String(sourceChapterId)]: topicNames
                        }
                    },
                    'source.externalId': mockTest?.source?.externalId || mockTest.testId
                }
            }
        );

        await MockTestTaxonomyMap.deleteMany({ testId: mockTest._id });

        const baseEdge = {
            testId: mockTest._id,
            seriesId: series?._id || null,
            subjectId: subject._id,
            chapterId: chapter._id,
            confidence: 'exact',
            provider,
            examType,
            sourceChapterId
        };

        await MockTestTaxonomyMap.updateOne(
            { testId: mockTest._id, subjectId: subject._id, chapterId: chapter._id, topicId: null },
            { $set: { ...baseEdge, topicId: null } },
            { upsert: true }
        );

        for (const topic of topicDocs) {
            await MockTestTaxonomyMap.updateOne(
                { testId: mockTest._id, subjectId: subject._id, chapterId: chapter._id, topicId: topic._id },
                {
                    $set: {
                        ...baseEdge,
                        topicId: topic._id,
                        sourceTopicName: topic.name
                    }
                },
                { upsert: true }
            );
        }
    }

    return {
        status: 'processed',
        externalId,
        mockTestId: String(mockTest._id),
        subjectName,
        chapterName,
        topics: topicNames.length
    };
}

async function recalcSeriesStats() {
    const grouped = await MockTest.aggregate([
        { $match: { seriesId: { $exists: true, $ne: null } } },
        { $group: { _id: '$seriesId', testsCount: { $sum: 1 } } }
    ]);

    for (const row of grouped) {
        await TestSeries.updateOne(
            { _id: row._id },
            { $set: { 'stats.testsCount': Number(row.testsCount || 0) } }
        );
    }
}

async function run() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing');
    }
    const { dryRun } = parseArgs();
    const rows = getRowsFromJson();
    await mongoose.connect(process.env.MONGODB_URI);

    let processed = 0;
    let skippedMulti = 0;
    let skippedNoMockTest = 0;
    let skippedNoExternalId = 0;
    let failed = 0;

    for (const row of rows) {
        if (!isSingleSubjectChapterRow(row)) {
            skippedMulti += 1;
            continue;
        }
        try {
            const result = await processRow(row, dryRun);
            if (result.status === 'processed') {
                processed += 1;
            } else if (result.status === 'skipped_mocktest_not_found') {
                skippedNoMockTest += 1;
            } else if (result.status === 'skipped_no_external_id') {
                skippedNoExternalId += 1;
            }
        } catch (error) {
            failed += 1;
            console.error(`Failed row id=${String(row?.id || '')}: ${error.message}`);
        }
    }

    if (!dryRun) {
        await recalcSeriesStats();
    }

    console.log('Single-subject/chapter remap complete');
    console.log({
        totalRows: rows.length,
        processed,
        skippedMulti,
        skippedNoMockTest,
        skippedNoExternalId,
        failed,
        dryRun
    });

    await mongoose.disconnect();
}

run().catch(async (error) => {
    console.error('Remap failed:', error.message);
    try {
        await mongoose.disconnect();
    } catch (e) {}
    process.exit(1);
});

