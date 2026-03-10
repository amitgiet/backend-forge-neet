const TestSeries = require('../models/TestSeries');
const TestSeriesSubject = require('../models/TestSeriesSubject');
const TestSeriesChapter = require('../models/TestSeriesChapter');
const TestSeriesTopic = require('../models/TestSeriesTopic');
const MockTestTaxonomyMap = require('../models/MockTestTaxonomyMap');

const normalizeName = (value) =>
    String(value || '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const toStringArray = (value) =>
    Array.isArray(value)
        ? value.map((v) => String(v || '').trim()).filter(Boolean)
        : [];

const toNumberArray = (value) =>
    Array.isArray(value)
        ? value
            .map((v) => Number(v))
            .filter((n) => Number.isFinite(n))
        : [];

const asObject = (value) => (value && typeof value === 'object' ? value : {});

const uniqueIds = (values) => {
    const seen = new Set();
    const out = [];
    for (const value of values || []) {
        const id = String(value || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(value);
    }
    return out;
};

const pickProvider = (mockTest) => {
    const sourceProvider = String(mockTest?.source?.provider || '').trim();
    if (sourceProvider) return sourceProvider;
    const institution = String(mockTest?.institution || '').trim();
    if (institution) return institution;
    return 'Custom';
};

const pickSeriesName = (mockTest, raw) =>
    String(mockTest?.seriesType || raw?.type || raw?.seriesType || '').trim();

const deriveTaxonomyPayload = (mockTest) => {
    const raw = asObject(mockTest?.source?.raw);
    const taxonomy = asObject(mockTest?.taxonomy);

    const subjectNames = toStringArray(
        taxonomy.subjectNames && taxonomy.subjectNames.length ? taxonomy.subjectNames : raw.subjectNames
    );
    const chapterNames = toStringArray(
        taxonomy.chapterNames && taxonomy.chapterNames.length ? taxonomy.chapterNames : raw.chapterNames
    );
    const topicNames = toStringArray(
        taxonomy.topicNames && taxonomy.topicNames.length ? taxonomy.topicNames : raw.topicNames
    );
    const chapterIds = toNumberArray(
        taxonomy.chapterIds && taxonomy.chapterIds.length ? taxonomy.chapterIds : raw.chapterIds
    );
    const chapterTopicsMap = asObject(
        taxonomy.chapterTopicsMap && Object.keys(taxonomy.chapterTopicsMap).length
            ? taxonomy.chapterTopicsMap
            : raw.chapterTopicsMap
    );

    return {
        raw,
        subjectNames,
        chapterNames,
        topicNames,
        chapterIds,
        chapterTopicsMap
    };
};

const appendAlias = (aliases = [], value = '') => {
    const text = String(value || '').trim();
    if (!text) return aliases || [];
    const set = new Set((aliases || []).map((v) => String(v).trim()).filter(Boolean));
    set.add(text);
    return [...set];
};

const upsertSeries = async ({ name, provider, examType }) => {
    if (!name) return null;
    const normalizedName = normalizeName(name);
    const existing = await TestSeries.findOne({ provider, examType, language: 'en', normalizedName });
    if (existing) {
        if (existing.name !== name || existing.seriesType !== name) {
            existing.name = existing.name || name;
            existing.seriesType = name;
            await existing.save();
        }
        return existing;
    }

    return TestSeries.create({
        name,
        normalizedName,
        provider,
        examType,
        language: 'en',
        seriesType: name
    });
};

const upsertSubject = async ({ name, examType }) => {
    const normalizedName = normalizeName(name);
    let subject = await TestSeriesSubject.findOne({ examType, normalizedName });
    if (!subject) {
        subject = await TestSeriesSubject.findOne({ name });
    }

    if (!subject) {
        return TestSeriesSubject.create({
            name,
            normalizedName,
            examType
        });
    }

    const nextAliases = appendAlias(subject.aliases, name);
    const updates = {};
    if (!subject.normalizedName) updates.normalizedName = normalizedName;
    if (nextAliases.length !== (subject.aliases || []).length) updates.aliases = nextAliases;
    if (Object.keys(updates).length) {
        await TestSeriesSubject.updateOne({ _id: subject._id }, { $set: updates });
        Object.assign(subject, updates);
    }
    return subject;
};

const upsertChapter = async ({ name, normalizedName, originalId, subjectId }) => {
    let chapter = await TestSeriesChapter.findOne({ subjectId, normalizedName });
    if (!chapter && Number.isFinite(originalId)) {
        chapter = await TestSeriesChapter.findOne({ subjectId, originalId });
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

    const nextAliases = appendAlias(chapter.aliases, name);
    const updates = {};
    if (!chapter.normalizedName) updates.normalizedName = normalizedName;
    if (!chapter.originalId && Number.isFinite(originalId)) updates.originalId = originalId;
    if (nextAliases.length !== (chapter.aliases || []).length) updates.aliases = nextAliases;
    if (Object.keys(updates).length) {
        await TestSeriesChapter.updateOne({ _id: chapter._id }, { $set: updates });
        Object.assign(chapter, updates);
    }
    return chapter;
};

const upsertTopic = async ({ name, normalizedName, chapterId }) => {
    let topic = await TestSeriesTopic.findOne({ chapterId, normalizedName });
    if (!topic) {
        topic = await TestSeriesTopic.findOne({ chapterId, name });
    }
    if (!topic) {
        return TestSeriesTopic.create({ name, normalizedName, chapterId });
    }

    const nextAliases = appendAlias(topic.aliases, name);
    const updates = {};
    if (!topic.normalizedName) updates.normalizedName = normalizedName;
    if (nextAliases.length !== (topic.aliases || []).length) updates.aliases = nextAliases;
    if (Object.keys(updates).length) {
        await TestSeriesTopic.updateOne({ _id: topic._id }, { $set: updates });
        Object.assign(topic, updates);
    }
    return topic;
};

const ensureFallbackSubject = async (examType) => upsertSubject({ name: 'Mixed / General', examType });

const findSubjectByName = (subjectDocs, name) => {
    const key = normalizeName(name);
    return subjectDocs.find((doc) => normalizeName(doc.name) === key) || null;
};

const inferSubjectNameFromChapterMapping = (mockTest, chapterRecord) => {
    const rows = Array.isArray(mockTest?.chapterMapping) ? mockTest.chapterMapping : [];
    if (!rows.length) return null;
    const byId = rows.find((row) => {
        if (!row) return false;
        if (Number.isFinite(chapterRecord.originalId)) {
            return String(row.chapterId || '') === String(chapterRecord.originalId);
        }
        return normalizeName(row.chapterId) === chapterRecord.normalizedName;
    });
    return byId ? String(byId.subject || '').trim() : null;
};

const deriveChapterRecords = ({ chapterNames, chapterIds }) => {
    const chapterRecords = [];
    for (let i = 0; i < chapterNames.length; i += 1) {
        const chapterName = chapterNames[i];
        if (!chapterName) continue;
        const originalId = Number.isFinite(chapterIds[i]) ? chapterIds[i] : undefined;
        chapterRecords.push({
            name: chapterName,
            normalizedName: normalizeName(chapterName),
            originalId
        });
    }
    return chapterRecords;
};

const dedupeEdges = (rows) => {
    const seen = new Set();
    const out = [];
    for (const row of rows) {
        const key = [
            String(row.subjectId || ''),
            String(row.chapterId || ''),
            String(row.topicId || ''),
            String(row.sourceChapterId || '')
        ].join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
    }
    return out;
};

const syncMockTestTaxonomy = async (mockTest) => {
    const examType = String(mockTest?.examType || 'NEET_UG');
    const provider = pickProvider(mockTest);
    const payload = deriveTaxonomyPayload(mockTest);
    const seriesName = pickSeriesName(mockTest, payload.raw);
    const series = await upsertSeries({ name: seriesName, provider, examType });

    const subjectDocs = [];
    for (const subjectName of payload.subjectNames) {
        const subjectDoc = await upsertSubject({ name: subjectName, examType });
        subjectDocs.push(subjectDoc);
    }

    const chapterRecords = deriveChapterRecords(payload);
    let fallbackSubject = null;
    if (subjectDocs.length > 1 && chapterRecords.length > 0) {
        fallbackSubject = await ensureFallbackSubject(examType);
    }

    const chapterDocRefs = [];
    for (const chapterRecord of chapterRecords) {
        let subjectDoc = null;
        if (subjectDocs.length === 1) {
            [subjectDoc] = subjectDocs;
        } else if (subjectDocs.length > 1) {
            const mappedName = inferSubjectNameFromChapterMapping(mockTest, chapterRecord);
            if (mappedName) {
                subjectDoc = findSubjectByName(subjectDocs, mappedName);
                if (!subjectDoc) {
                    const newSubject = await upsertSubject({ name: mappedName, examType });
                    subjectDocs.push(newSubject);
                    subjectDoc = newSubject;
                }
            }
        }

        if (!subjectDoc && fallbackSubject) {
            subjectDoc = fallbackSubject;
        }
        if (!subjectDoc && subjectDocs.length > 0) {
            [subjectDoc] = subjectDocs;
        }
        if (!subjectDoc) {
            subjectDoc = await ensureFallbackSubject(examType);
            subjectDocs.push(subjectDoc);
        }

        const chapterDoc = await upsertChapter({
            name: chapterRecord.name,
            normalizedName: chapterRecord.normalizedName,
            originalId: chapterRecord.originalId,
            subjectId: subjectDoc._id
        });

        chapterDocRefs.push({
            chapter: chapterDoc,
            subject: subjectDoc,
            originalId: chapterRecord.originalId
        });
    }

    const topicDocs = [];
    const edgeRows = [];

    if (chapterDocRefs.length === 0 && subjectDocs.length) {
        for (const subjectDoc of subjectDocs) {
            edgeRows.push({
                testId: mockTest._id,
                seriesId: series?._id,
                subjectId: subjectDoc._id,
                chapterId: null,
                topicId: null,
                confidence: 'inferred',
                provider,
                examType
            });
        }
    }

    for (const ref of chapterDocRefs) {
        edgeRows.push({
            testId: mockTest._id,
            seriesId: series?._id,
            subjectId: ref.subject._id,
            chapterId: ref.chapter._id,
            topicId: null,
            sourceChapterId: Number.isFinite(ref.originalId) ? ref.originalId : undefined,
            confidence: 'exact',
            provider,
            examType
        });

        let topicNames = [];
        if (Number.isFinite(ref.originalId)) {
            topicNames = toStringArray(payload.chapterTopicsMap[String(ref.originalId)]);
        }
        if (!topicNames.length && chapterDocRefs.length === 1 && payload.topicNames.length) {
            topicNames = payload.topicNames;
        }

        for (const topicName of topicNames) {
            const topicDoc = await upsertTopic({
                name: topicName,
                normalizedName: normalizeName(topicName),
                chapterId: ref.chapter._id
            });
            topicDocs.push(topicDoc);
            edgeRows.push({
                testId: mockTest._id,
                seriesId: series?._id,
                subjectId: ref.subject._id,
                chapterId: ref.chapter._id,
                topicId: topicDoc._id,
                sourceChapterId: Number.isFinite(ref.originalId) ? ref.originalId : undefined,
                sourceTopicName: topicName,
                confidence: 'exact',
                provider,
                examType
            });
        }
    }

    const dedupedEdges = dedupeEdges(edgeRows);
    await MockTestTaxonomyMap.deleteMany({ testId: mockTest._id });
    if (dedupedEdges.length > 0) {
        await MockTestTaxonomyMap.insertMany(dedupedEdges, { ordered: false });
    }

    const subjectIds = uniqueIds(subjectDocs.map((s) => s._id));
    const chapterIds = uniqueIds(chapterDocRefs.map((c) => c.chapter._id));
    const topicIds = uniqueIds(topicDocs.map((t) => t._id));

    let taxonomyStatus = 'unmapped';
    if (subjectIds.length && chapterIds.length) {
        taxonomyStatus = topicIds.length || payload.topicNames.length === 0 ? 'complete' : 'partial';
    } else if (subjectIds.length || chapterIds.length || topicIds.length) {
        taxonomyStatus = 'partial';
    }

    return {
        seriesId: series?._id || undefined,
        provider,
        taxonomyStatus,
        testSeriesDetails: {
            subjectIds,
            chapterIds,
            topicIds
        },
        facets: {
            subjectIds,
            chapterIds,
            topicIds
        },
        taxonomy: {
            subjectNames: payload.subjectNames,
            chapterNames: payload.chapterNames,
            topicNames: payload.topicNames,
            chapterIds: payload.chapterIds,
            chapterTopicsMap: payload.chapterTopicsMap
        }
    };
};

module.exports = {
    normalizeName,
    toStringArray,
    toNumberArray,
    deriveTaxonomyPayload,
    syncMockTestTaxonomy
};
