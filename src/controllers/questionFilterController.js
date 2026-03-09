/**
 * controllers/questionFilterController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Exposes the 34K ImportedQuestion bank through three focused endpoints:
 *
 *  GET  /api/questions/filter   – paginated filter by subject/chapter/subtopic/difficulty/isPYQ
 *  GET  /api/questions/pyq      – PYQ shortcut filter (year, exam, subject, chapter)
 *  POST /api/questions/test     – Custom test generator (random N questions from filter criteria)
 *  GET  /api/questions/meta     – Aggregated counts for building filter UI dropdowns
 */

'use strict';

const ImportedQuestion = require('../models/ImportedQuestion');
const ImportedCurriculum = require('../models/ImportedCurriculum');

const VALID_SUBJECTS = ['biology', 'chemistry', 'physics'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
const VALID_PYQ_EXAMS = ['NEET', 'AIPMT', 'AIIMS', 'JIPMER', 'NEET_UG'];
const MAX_TEST_SIZE = 200;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildFilterQuery(params) {
    const {
        subject, chapterId, subTopic, topic,
        difficulty, isPYQ, pyqYear, pyqExam,
        search, isActive = true,
    } = params;

    const query = {};

    if (isActive !== false) query.isActive = { $ne: false };

    if (subject && VALID_SUBJECTS.includes(String(subject).toLowerCase())) {
        query.subject = String(subject).toLowerCase();
    }

    if (chapterId) {
        query.chapterId = String(chapterId).trim();
    }

    if (topic) {
        query.topic = String(topic).trim();
    }

    if (subTopic) {
        query.subTopic = String(subTopic).trim();
    }

    if (difficulty && VALID_DIFFICULTIES.includes(String(difficulty).toLowerCase())) {
        query.difficulty = String(difficulty).toLowerCase();
    }

    if (isPYQ === 'true' || isPYQ === true) {
        query.isPYQ = true;
    } else if (isPYQ === 'false' || isPYQ === false) {
        query.isPYQ = false;
    }

    if (pyqYear) {
        const y = parseInt(pyqYear, 10);
        if (!isNaN(y)) query.pyqYear = y;
    }

    if (pyqExam && VALID_PYQ_EXAMS.includes(String(pyqExam).toUpperCase())) {
        query.pyqExam = String(pyqExam).toUpperCase();
    }

    if (search && String(search).trim().length >= 2) {
        const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.question = { $regex: escaped, $options: 'i' };
    }

    return query;
}

// ── GET /api/questions/filter ─────────────────────────────────────────────────
/**
 * Filterable paginated question list.
 * Query params:
 *   subject, chapterId, topic, subTopic, difficulty, isPYQ, pyqYear, pyqExam
 *   search (text match on question), page (default 1), limit (default 20, max 100)
 */
exports.filterQuestions = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.limit || String(DEFAULT_PAGE_SIZE), 10)));
        const skip = (page - 1) * limit;

        const query = buildFilterQuery(req.query);

        const [total, questions] = await Promise.all([
            ImportedQuestion.countDocuments(query),
            ImportedQuestion.find(query)
                .select('-__v')
                .sort({ subject: 1, chapterId: 1, subTopic: 1, questionId: 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
        ]);

        res.json({
            success: true,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNext: page * limit < total,
            },
            data: questions,
        });
    } catch (err) {
        console.error('filterQuestions error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ── GET /api/questions/pyq ────────────────────────────────────────────────────
/**
 * PYQ shortcut — returns previous-year questions with optional filters.
 * Query params: subject, chapterId, pyqYear, pyqExam, limit (default 50)
 */
exports.getPYQs = async (req, res) => {
    try {
        const { subject, chapterId, pyqYear, pyqExam } = req.query;
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10)));

        const questions = await ImportedQuestion.getPYQs({
            subject,
            chapterId,
            pyqYear,
            pyqExam,
            limit,
        });

        // Group by year for UI convenience
        const byYear = {};
        questions.forEach((q) => {
            const yr = String(q.pyqYear || 'unknown');
            if (!byYear[yr]) byYear[yr] = [];
            byYear[yr].push(q);
        });

        res.json({
            success: true,
            total: questions.length,
            byYear,
            data: questions,
        });
    } catch (err) {
        console.error('getPYQs error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ── POST /api/questions/test ──────────────────────────────────────────────────
/**
 * Custom Test Generator — picks N random questions matching given filters.
 * Body:
 *   subject, chapterId, subTopic, topic, difficulty, isPYQ, pyqYear, pyqExam
 *   count (default 20, max 200)
 *   title    – optional test title
 *   mode     – "practice" | "test" (default "practice")
 */
exports.generateCustomTest = async (req, res) => {
    try {
        const {
            subject,               // single subject (legacy)
            subjects,              // NEW: array of subjects for combined quiz
            chapterId, subTopic, topic,
            difficulty, isPYQ, pyqYear, pyqExam,
            count = 20,
            title,
            mode = 'practice',
        } = req.body || {};

        const countNum = Math.min(MAX_TEST_SIZE, Math.max(1, parseInt(count, 10) || 20));

        // Resolve subject list — support both `subject` (string) and `subjects` (array)
        let subjectList = [];
        if (Array.isArray(subjects) && subjects.length > 0) {
            subjectList = subjects
                .map((s) => String(s).toLowerCase())
                .filter((s) => VALID_SUBJECTS.includes(s));
        } else if (subject && VALID_SUBJECTS.includes(String(subject).toLowerCase())) {
            subjectList = [String(subject).toLowerCase()];
        }

        const isMultiSubject = subjectList.length > 1;

        // ── Multi-subject: proportional sampling per subject ──────────────────
        if (isMultiSubject) {
            const perSubject = Math.ceil(countNum / subjectList.length);

            // Build base filters (no subject — will be injected per loop)
            const baseQuery = buildFilterQuery({ chapterId, subTopic, topic, difficulty, isPYQ, pyqYear, pyqExam });

            // Sample per subject in parallel
            const sampledArrays = await Promise.all(
                subjectList.map((sub) =>
                    ImportedQuestion.aggregate([
                        { $match: { ...baseQuery, subject: sub } },
                        { $sample: { size: perSubject } },
                        { $project: { __v: 0, chapter_start: 0, chapter_end: 0 } },
                    ])
                )
            );

            // Interleave subjects so questions alternate (Bio, Chem, Phys, Bio, …)
            const questions = [];
            const maxLen = Math.max(...sampledArrays.map((a) => a.length));
            for (let i = 0; i < maxLen; i++) {
                sampledArrays.forEach((arr) => { if (arr[i]) questions.push(arr[i]); });
            }

            // Trim to requested count
            const finalQuestions = questions.slice(0, countNum);

            if (finalQuestions.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'No questions found for the selected filters',
                    filters: { subjects: subjectList, difficulty, isPYQ },
                });
            }

            const available = sampledArrays.reduce((sum, a) => sum + a.length, 0);
            const durationSeconds = mode === 'test' ? finalQuestions.length * 72 : null;

            return res.json({
                success: true,
                meta: {
                    title: title || `Combined ${subjectList.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' + ')} Test`,
                    mode,
                    total: finalQuestions.length,
                    available,
                    requested: countNum,
                    durationSeconds,
                    subjects: subjectList,
                    filters: { subjects: subjectList, difficulty, isPYQ },
                    breakdown: sampledArrays.map((arr, i) => ({ subject: subjectList[i], count: arr.length })),
                },
                data: finalQuestions,
            });
        }

        // ── Single subject: original logic ────────────────────────────────────
        const query = buildFilterQuery({
            subject: subjectList[0],
            chapterId, subTopic, topic,
            difficulty, isPYQ, pyqYear, pyqExam,
        });

        if (Object.keys(query).length <= 1) {
            return res.status(400).json({
                success: false,
                error: 'Please specify at least one filter: subject, chapterId, difficulty, or isPYQ',
            });
        }

        const available = await ImportedQuestion.countDocuments(query);
        if (available === 0) {
            return res.status(404).json({
                success: false,
                error: 'No questions found for the selected filters',
                filters: query,
            });
        }

        const questions = await ImportedQuestion.aggregate([
            { $match: query },
            { $sample: { size: countNum } },
            { $project: { __v: 0, chapter_start: 0, chapter_end: 0 } },
        ]);

        // Shuffle
        for (let i = questions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [questions[i], questions[j]] = [questions[j], questions[i]];
        }

        const durationSeconds = mode === 'test' ? questions.length * 72 : null;

        res.json({
            success: true,
            meta: {
                title: title || buildAutoTitle({ subject: subjectList[0], chapterId, subTopic, difficulty, isPYQ }),
                mode,
                total: questions.length,
                available,
                requested: countNum,
                durationSeconds,
                filters: { subject: subjectList[0], chapterId, subTopic, topic, difficulty, isPYQ, pyqYear, pyqExam },
            },
            data: questions,
        });
    } catch (err) {
        console.error('generateCustomTest error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ── GET /api/questions/meta ───────────────────────────────────────────────────
/**
 * Returns aggregate counts for building filter dropdowns on the frontend.
 * Optional query param: subject (to narrow chapter/subtopic counts)
 */
exports.getFilterMeta = async (req, res) => {
    try {
        const { subject } = req.query;

        const matchStage = { isActive: { $ne: false } };
        if (subject && VALID_SUBJECTS.includes(String(subject).toLowerCase())) {
            matchStage.subject = String(subject).toLowerCase();
        }

        const [subjectCounts, difficultyCounts, pyqYears, chapterCounts] = await Promise.all([
            // Per-subject totals
            ImportedQuestion.aggregate([
                { $match: { isActive: { $ne: false } } },
                { $group: { _id: '$subject', count: { $sum: 1 } } },
                { $sort: { _id: 1 } },
            ]),

            // Per-difficulty totals (within subject filter)
            ImportedQuestion.aggregate([
                { $match: matchStage },
                { $group: { _id: '$difficulty', count: { $sum: 1 } } },
                { $sort: { _id: 1 } },
            ]),

            // Available PYQ years (within subject filter)
            ImportedQuestion.aggregate([
                { $match: { ...matchStage, isPYQ: true, pyqYear: { $ne: null } } },
                { $group: { _id: '$pyqYear', count: { $sum: 1 } } },
                { $sort: { _id: -1 } },
            ]),

            // Per-chapter counts (within subject filter, top 50)
            ImportedQuestion.aggregate([
                { $match: { ...matchStage, chapterId: { $ne: null } } },
                { $group: { _id: '$chapterId', subject: { $first: '$subject' }, count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 60 },
            ]),
        ]);

        const totalPYQ = await ImportedQuestion.countDocuments({ ...matchStage, isPYQ: true });
        const totalCount = await ImportedQuestion.countDocuments(matchStage);

        res.json({
            success: true,
            data: {
                total: totalCount,
                totalPYQ,
                subjects: subjectCounts.map((s) => ({ subject: s._id, count: s.count })),
                difficulties: difficultyCounts.map((d) => ({ difficulty: d._id, count: d.count })),
                pyqYears: pyqYears.map((y) => ({ year: y._id, count: y.count })),
                chapters: chapterCounts.map((c) => ({
                    chapterId: c._id,
                    subject: c.subject,
                    count: c.count,
                })),
            },
        });
    } catch (err) {
        console.error('getFilterMeta error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ── Internal helper ────────────────────────────────────────────────────────────
function buildAutoTitle({ subject, chapterId, subTopic, difficulty, isPYQ } = {}) {
    const parts = [];
    if (isPYQ) parts.push('PYQ');
    if (subject) parts.push(String(subject).charAt(0).toUpperCase() + String(subject).slice(1));
    if (chapterId) parts.push(String(chapterId));
    if (subTopic) parts.push(String(subTopic));
    if (difficulty) parts.push(`(${difficulty})`);
    return parts.length ? parts.join(' – ') : 'Custom Practice Test';
}
