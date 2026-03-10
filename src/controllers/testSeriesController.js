const TestSeriesSubject = require('../models/TestSeriesSubject');
const TestSeriesChapter = require('../models/TestSeriesChapter');
const TestSeriesTopic = require('../models/TestSeriesTopic');
const MockTest = require('../models/MockTest');
const MockTestProgress = require('../models/MockTestProgress');
const MockTestTaxonomyMap = require('../models/MockTestTaxonomyMap');
const ErrorResponse = require('../utils/errorResponse');
const mongoose = require('mongoose');

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 20;

const toBool = (value) => value === true || value === 'true' || value === 1 || value === '1';

const toPositiveInt = (value, fallback) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return fallback;
    return Math.floor(num);
};

const getAccessTypes = (plan) => {
    const accessTypes = ['FREE'];
    if (plan === 'pro' || plan === 'ultimate') accessTypes.push('PRO');
    if (plan === 'ultimate') accessTypes.push('ULTIMATE');
    return accessTypes;
};

const ensureObjectId = (value, fieldName) => {
    if (!value) return null;
    if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new ErrorResponse(`Invalid ${fieldName}`, 400);
    }
    return new mongoose.Types.ObjectId(value);
};

const buildSeriesKeyStages = () => ([
    {
        $addFields: {
            _seriesTypeTrim: { $trim: { input: { $ifNull: ['$seriesType', ''] } } },
            _testIdUpper: { $toUpper: { $ifNull: ['$testId', ''] } }
        }
    },
    {
        $addFields: {
            _btsKey: {
                $let: {
                    vars: { m: { $regexFind: { input: '$_testIdUpper', regex: /^(BTS\d{4})_/ } } },
                    in: {
                        $cond: [
                            { $gt: [{ $size: { $ifNull: ['$$m.captures', []] } }, 0] },
                            { $arrayElemAt: [{ $ifNull: ['$$m.captures', []] }, 0] },
                            null
                        ]
                    }
                }
            },
            _prefUnderscoreKey: {
                $let: {
                    vars: { m: { $regexFind: { input: '$_testIdUpper', regex: /^([A-Z]+)_/ } } },
                    in: {
                        $cond: [
                            { $gt: [{ $size: { $ifNull: ['$$m.captures', []] } }, 0] },
                            { $arrayElemAt: [{ $ifNull: ['$$m.captures', []] }, 0] },
                            null
                        ]
                    }
                }
            },
            _prefAlphaKey: {
                $let: {
                    vars: { m: { $regexFind: { input: '$_testIdUpper', regex: /^([A-Z]+)/ } } },
                    in: {
                        $cond: [
                            { $gt: [{ $size: { $ifNull: ['$$m.captures', []] } }, 0] },
                            { $arrayElemAt: [{ $ifNull: ['$$m.captures', []] }, 0] },
                            null
                        ]
                    }
                }
            }
        }
    },
    {
        $addFields: {
            seriesKey: {
                $cond: [
                    { $gt: [{ $strLenCP: '$_seriesTypeTrim' }, 0] },
                    '$_seriesTypeTrim',
                    {
                        $ifNull: [
                            '$_btsKey',
                            {
                                $ifNull: [
                                    '$_prefUnderscoreKey',
                                    { $ifNull: ['$_prefAlphaKey', 'OTHER'] }
                                ]
                            }
                        ]
                    }
                ]
            }
        }
    }
]);

const fetchTestIdsBySeriesKey = async (baseQuery, seriesKey) => {
    const rows = await MockTest.aggregate([
        { $match: baseQuery },
        ...buildSeriesKeyStages(),
        { $match: { seriesKey } },
        { $project: { _id: 1 } }
    ]);
    return rows.map((row) => row._id);
};

const fetchFallbackTaxonomyIds = async (scoped = {}) => {
    const or = [];
    if (scoped.subjectId) {
        const id = ensureObjectId(scoped.subjectId, 'subjectId');
        or.push(
            { 'testSeriesDetails.subjectIds': id },
            { 'facets.subjectIds': id }
        );
    }
    if (scoped.chapterId) {
        const id = ensureObjectId(scoped.chapterId, 'chapterId');
        or.push(
            { 'testSeriesDetails.chapterIds': id },
            { 'facets.chapterIds': id }
        );
    }
    if (scoped.topicId) {
        const id = ensureObjectId(scoped.topicId, 'topicId');
        or.push(
            { 'testSeriesDetails.topicIds': id },
            { 'facets.topicIds': id }
        );
    }
    if (!or.length) return [];
    return MockTest.find({ $or: or }).distinct('_id');
};

const buildBaseTestQuery = (req, scoped = {}) => {
    const plan = req.user?.subscription?.plan || 'free';
    const accessTypes = getAccessTypes(plan);
    const examType = String(req.query.examType || req.user?.primaryExam || 'NEET_UG').trim();

    const query = {
        isActive: true,
        examType,
        accessType: { $in: accessTypes }
    };

    const testType = String(req.query.testType || '').trim();
    if (testType) query.testType = testType;

    const classCategory = String(req.query.classCategory || '').trim();
    if (classCategory && classCategory !== 'all') query.classCategory = classCategory;

    const institution = String(req.query.institution || '').trim();
    if (institution && institution !== 'all') query.institution = institution;

    const provider = String(req.query.provider || '').trim();
    if (provider && provider !== 'all') query['source.provider'] = provider;

    const seriesType = String(scoped.seriesType || req.query.seriesType || '').trim();
    if (seriesType && !scoped.seriesKey) query.seriesType = seriesType;

    if (toBool(req.query.freeOnly)) {
        query.accessType = 'FREE';
    }

    const search = String(req.query.search || '').trim();
    if (search) {
        query.$or = [
            { testId: { $regex: search, $options: 'i' } },
            { 'title.en': { $regex: search, $options: 'i' } },
            { 'title.hi': { $regex: search, $options: 'i' } }
        ];
    }

    return query;
};

const fetchEligibleTestIds = async (baseQuery) => MockTest.find(baseQuery).distinct('_id');

const fetchProgressMap = async (userId, tests) => {
    const testIds = tests.map((t) => t.testId).filter(Boolean);
    if (!testIds.length) return new Map();

    const rows = await MockTestProgress.find({ userId, testId: { $in: testIds } }).lean();
    return new Map(rows.map((row) => [String(row.testId), row]));
};

const sortByNameAsc = (rows = []) =>
    [...rows].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }));

const withProgress = async (userId, tests) => {
    const progressMap = await fetchProgressMap(userId, tests);
    return tests.map((t) => {
        const p = progressMap.get(String(t.testId));
        return {
            ...t,
            progress: {
                completed: Boolean(p?.completed),
                completedAt: p?.completedAt || null
            }
        };
    });
};

const listTests = async (req, res, next, scoped = {}) => {
    try {
        const query = buildBaseTestQuery(req, scoped);
        const page = toPositiveInt(req.query.page, 1);
        const limit = Math.min(MAX_LIMIT, toPositiveInt(req.query.limit, DEFAULT_LIMIT));
        const skip = (page - 1) * limit;

        const mapFilter = {};
        if (scoped.subjectId) mapFilter.subjectId = ensureObjectId(scoped.subjectId, 'subjectId');
        if (scoped.chapterId) mapFilter.chapterId = ensureObjectId(scoped.chapterId, 'chapterId');
        if (scoped.topicId) mapFilter.topicId = ensureObjectId(scoped.topicId, 'topicId');

        if (Object.keys(mapFilter).length > 0) {
            const mappedIds = await MockTestTaxonomyMap.find(mapFilter).distinct('testId');
            const fallbackIds = await fetchFallbackTaxonomyIds(scoped);
            const combinedIds = Array.from(
                new Set([...mappedIds, ...fallbackIds].map((id) => String(id)))
            ).map((id) => new mongoose.Types.ObjectId(id));

            if (!combinedIds.length) {
                return res.status(200).json({
                    success: true,
                    data: [],
                    pagination: { page, limit, total: 0, pages: 0 }
                });
            }
            query._id = { $in: combinedIds };
        }

        if (scoped.seriesKey) {
            const seriesIds = await fetchTestIdsBySeriesKey(query, String(scoped.seriesKey).trim());
            if (!seriesIds.length) {
                return res.status(200).json({
                    success: true,
                    data: [],
                    pagination: { page, limit, total: 0, pages: 0 }
                });
            }

            if (query._id && Array.isArray(query._id.$in)) {
                const seriesSet = new Set(seriesIds.map((id) => String(id)));
                const merged = query._id.$in.filter((id) => seriesSet.has(String(id)));
                if (!merged.length) {
                    return res.status(200).json({
                        success: true,
                        data: [],
                        pagination: { page, limit, total: 0, pages: 0 }
                    });
                }
                query._id = { $in: merged };
            } else {
                query._id = { $in: seriesIds };
            }
        }

        const total = await MockTest.countDocuments(query);
        const tests = await MockTest.find(query, {
            testId: 1,
            title: 1,
            description: 1,
            config: 1,
            accessType: 1,
            classCategory: 1,
            seriesType: 1,
            source: 1,
            testType: 1,
            tags: 1,
            resources: 1,
            testSeriesDetails: 1,
            facets: 1,
            seriesId: 1,
            institution: 1,
            scheduledAt: 1,
            taxonomyStatus: 1,
            createdAt: 1
        })
            .sort({ scheduledAt: 1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const data = await withProgress(req.user.id, tests);

        res.status(200).json({
            success: true,
            data,
            pagination: {
                page,
                limit,
                total,
                pages: total > 0 ? Math.ceil(total / limit) : 0
            }
        });
    } catch (error) {
        next(error);
    }
};

const buildCountMap = async (collectionModel, keyField, rows) => {
    const ids = rows.map((row) => row._id).filter(Boolean);
    if (!ids.length) return [];
    const docs = await collectionModel.find({ _id: { $in: ids } }).lean();
    const docMap = new Map(docs.map((d) => [String(d._id), d]));

    return rows
        .map((row) => {
            const doc = docMap.get(String(row._id));
            if (!doc) return null;
            return {
                ...doc,
                testCount: Number(row.testCount || 0),
                [keyField]: row._id
            };
        })
        .filter(Boolean);
};

exports.getSeriesCatalog = async (req, res, next) => {
    try {
        const query = buildBaseTestQuery(req);
        const rows = await MockTest.aggregate([
            { $match: query },
            ...buildSeriesKeyStages(),
            {
                $lookup: {
                    from: 'mocktestprogress',
                    let: { testId: '$testId' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$testId', '$$testId'] },
                                        { $eq: ['$userId', new mongoose.Types.ObjectId(req.user.id)] },
                                        { $eq: ['$completed', true] }
                                    ]
                                }
                            }
                        },
                        { $project: { _id: 1 } },
                        { $limit: 1 }
                    ],
                    as: '_completed'
                }
            },
            {
                $group: {
                    _id: '$seriesKey',
                    count: { $sum: 1 },
                    completedCount: {
                        $sum: {
                            $cond: [
                                { $gt: [{ $size: { $ifNull: ['$_completed', []] } }, 0] },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.status(200).json({
            success: true,
            data: rows.map((row) => ({
                seriesType: row._id || '',
                count: row.count,
                completedCount: Number(row.completedCount || 0)
            }))
        });
    } catch (error) {
        next(error);
    }
};

exports.getFilteredTests = async (req, res, next) => listTests(req, res, next);
exports.getTestsBySeriesType = async (req, res, next) =>
    listTests(req, res, next, { seriesKey: decodeURIComponent(req.params.seriesType || '') });
exports.getTestsBySubject = async (req, res, next) =>
    listTests(req, res, next, { subjectId: req.params.subjectId });
exports.getTestsByChapter = async (req, res, next) =>
    listTests(req, res, next, { chapterId: req.params.chapterId });
exports.getTestsByTopic = async (req, res, next) =>
    listTests(req, res, next, { topicId: req.params.topicId });

exports.getSubjects = async (req, res, next) => {
    try {
        const baseQuery = buildBaseTestQuery(req);
        const eligibleTestIds = await fetchEligibleTestIds(baseQuery);
        if (!eligibleTestIds.length) {
            return res.status(200).json({ success: true, data: [] });
        }

        const rows = await MockTestTaxonomyMap.aggregate([
            {
                $match: {
                    testId: { $in: eligibleTestIds },
                    subjectId: { $ne: null }
                }
            },
            {
                $group: {
                    _id: '$subjectId',
                    tests: { $addToSet: '$testId' }
                }
            },
            {
                $project: {
                    testCount: { $size: '$tests' }
                }
            },
            { $sort: { testCount: -1 } }
        ]);

        let subjects = await buildCountMap(TestSeriesSubject, 'subjectId', rows);
        subjects = sortByNameAsc(subjects);
        if (!subjects.length) {
            subjects = await TestSeriesSubject.find().sort({ name: 1 }).lean();
        }

        res.status(200).json({
            success: true,
            data: subjects
        });
    } catch (error) {
        next(error);
    }
};

exports.getChapters = async (req, res, next) => {
    try {
        const { subjectId } = req.params;
        const subjectObjectId = ensureObjectId(subjectId, 'subjectId');
        const baseQuery = buildBaseTestQuery(req);
        const eligibleTestIds = await fetchEligibleTestIds(baseQuery);
        if (!eligibleTestIds.length) {
            return res.status(200).json({ success: true, data: [] });
        }

        const rows = await MockTestTaxonomyMap.aggregate([
            {
                $match: {
                    testId: { $in: eligibleTestIds },
                    subjectId: subjectObjectId,
                    chapterId: { $ne: null }
                }
            },
            {
                $group: {
                    _id: '$chapterId',
                    tests: { $addToSet: '$testId' }
                }
            },
            {
                $project: {
                    testCount: { $size: '$tests' }
                }
            },
            { $sort: { testCount: -1 } }
        ]);

        let chapters = await buildCountMap(TestSeriesChapter, 'chapterId', rows);
        chapters = sortByNameAsc(chapters);
        if (!chapters.length) {
            chapters = await TestSeriesChapter.find({ subjectId: subjectObjectId }).sort({ name: 1 }).lean();
        }

        res.status(200).json({
            success: true,
            data: chapters
        });
    } catch (error) {
        next(error);
    }
};

exports.getTopics = async (req, res, next) => {
    try {
        const { chapterId } = req.params;
        const chapterObjectId = ensureObjectId(chapterId, 'chapterId');
        const baseQuery = buildBaseTestQuery(req);
        const eligibleTestIds = await fetchEligibleTestIds(baseQuery);
        if (!eligibleTestIds.length) {
            return res.status(200).json({ success: true, data: [] });
        }

        const rows = await MockTestTaxonomyMap.aggregate([
            {
                $match: {
                    testId: { $in: eligibleTestIds },
                    chapterId: chapterObjectId,
                    topicId: { $ne: null }
                }
            },
            {
                $group: {
                    _id: '$topicId',
                    tests: { $addToSet: '$testId' }
                }
            },
            {
                $project: {
                    testCount: { $size: '$tests' }
                }
            },
            { $sort: { testCount: -1 } }
        ]);

        let topics = await buildCountMap(TestSeriesTopic, 'topicId', rows);
        if (!topics.length) {
            topics = await TestSeriesTopic.find({ chapterId: chapterObjectId }).sort({ name: 1 }).lean();
        }

        res.status(200).json({
            success: true,
            data: topics
        });
    } catch (error) {
        next(error);
    }
};
