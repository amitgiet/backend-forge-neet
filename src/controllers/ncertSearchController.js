const mongoose = require('mongoose');
const http = require('http');
const https = require('https');
const Chapter = require('../models/Chapter');
const Topic = require('../models/Topic');
const Question = require('../models/Question');
const NcertTopicQuizAttempt = require('../models/NcertTopicQuizAttempt');
const ErrorResponse = require('../utils/errorResponse');

const toRegex = (value) => new RegExp(value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const allowedLangs = new Set(['en', 'hi']);

const getPreferredLang = (req) => {
    const fromQuery = String(req.query.lang || '').toLowerCase();
    if (allowedLangs.has(fromQuery)) return fromQuery;
    const fromUser = String(req.user?.profile?.preferredLanguage || '').toLowerCase();
    if (allowedLangs.has(fromUser)) return fromUser;
    return 'en';
};

const pickLocalizedName = (name, lang) => {
    if (!name) return '';
    return name[lang] || name.en || name.hi || '';
};

const resolveLocalizedContentSource = (contentSource, lang) => {
    if (!contentSource) return null;

    // New shape: contentSource.en / contentSource.hi
    const localized = contentSource[lang];
    if (localized?.resourceUrl) {
        return {
            resourceType: localized.resourceType || 'external',
            resourceUrl: localized.resourceUrl
        };
    }

    // Fallback to English in new shape
    const en = contentSource.en;
    if (en?.resourceUrl) {
        return {
            resourceType: en.resourceType || 'external',
            resourceUrl: en.resourceUrl
        };
    }

    // Legacy single-shape support
    if (contentSource.resourceUrl) {
        return {
            resourceType: contentSource.resourceType || 'external',
            resourceUrl: contentSource.resourceUrl
        };
    }

    // First available language block
    const firstAvailable = ['en', 'hi']
        .map((code) => contentSource[code])
        .find((entry) => entry?.resourceUrl);
    if (firstAvailable) {
        return {
            resourceType: firstAvailable.resourceType || 'external',
            resourceUrl: firstAvailable.resourceUrl
        };
    }

    return null;
};

const getQuestionCorrectKey = (question) => {
    if (question.correctAnswer) return question.correctAnswer;
    const correctOption = (question.options || []).find((opt) => opt.isCorrect);
    return correctOption?.key || null;
};

const downloadPdfOnce = (urlString, redirectCount = 0) => new Promise((resolve, reject) => {
    if (redirectCount > 5) {
        return reject(new Error('Too many redirects while fetching PDF'));
    }

    let parsed;
    try {
        parsed = new URL(urlString);
    } catch (error) {
        return reject(new Error('Invalid PDF URL'));
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(parsed, {
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/pdf,*/*',
            'Connection': 'close'
        }
    }, (response) => {
        const statusCode = response.statusCode || 0;

        if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
            const redirectUrl = new URL(response.headers.location, parsed).toString();
            response.resume();
            return resolve(downloadPdfOnce(redirectUrl, redirectCount + 1));
        }

        if (statusCode < 200 || statusCode >= 300) {
            response.resume();
            return reject(new Error(`Upstream returned ${statusCode}`));
        }

        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
            const body = Buffer.concat(chunks);
            resolve({
                buffer: body,
                headers: response.headers
            });
        });
        response.on('error', reject);
    });

    req.setTimeout(15000, () => {
        req.destroy(new Error('PDF fetch timeout'));
    });
    req.on('error', reject);
    req.end();
});

const downloadPdfWithRetry = async (urlString, maxAttempts = 3) => {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await downloadPdfOnce(urlString, 0);
        } catch (error) {
            lastError = error;
            const isLastAttempt = attempt === maxAttempts;
            if (isLastAttempt) break;
            await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
        }
    }
    throw lastError;
};

// @desc    Proxy NCERT PDF for iframe rendering (public, allowlisted domains only)
// @route   GET /api/v1/ncert-search/pdf-proxy?url=...
// @access  Public
exports.proxyNcertPdf = async (req, res, next) => {
    try {
        const rawUrl = req.query.url;
        if (!rawUrl) {
            return next(new ErrorResponse('url query param is required', 400));
        }

        let parsed;
        try {
            parsed = new URL(String(rawUrl));
        } catch (error) {
            return next(new ErrorResponse('Invalid url', 400));
        }

        const allowedHosts = new Set(['ncert.nic.in', 'www.ncert.nic.in']);
        if (!allowedHosts.has(parsed.hostname)) {
            return next(new ErrorResponse('Only NCERT URLs are allowed', 403));
        }

        const upstream = await downloadPdfWithRetry(parsed.toString(), 3);

        const allowedFrameAncestors = [
            "'self'",
            'http://localhost:8080',
            'http://localhost:3000',
            process.env.FRONTEND_URL,
            process.env.FRONTEND_URL_PROD
        ].filter(Boolean);

        // Override helmet defaults for this proxied PDF response so it can be embedded in frontend iframe
        res.removeHeader('X-Frame-Options');
        res.setHeader('Content-Security-Policy', `frame-ancestors ${allowedFrameAncestors.join(' ')};`);

        const contentType = upstream.headers['content-type'] || 'application/pdf';
        const contentDisposition = upstream.headers['content-disposition'] || 'inline';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', contentDisposition);
        res.setHeader('Cache-Control', 'public, max-age=86400');

        return res.status(200).send(upstream.buffer);
    } catch (error) {
        next(error);
    }
};

// @desc    Get available subjects for NCERT search flow
// @route   GET /api/v1/ncert-search/subjects
// @access  Private
exports.getSubjects = async (req, res, next) => {
    try {
        const subjects = await Chapter.distinct('subject', { isActive: true });
        res.status(200).json({
            success: true,
            data: subjects.sort()
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get chapters by subject
// @route   GET /api/v1/ncert-search/chapters
// @access  Private
exports.getChapters = async (req, res, next) => {
    try {
        const lang = getPreferredLang(req);
        const { subject, class: ncertClass } = req.query;
        const query = { isActive: true };
        if (subject) query.subject = subject.toLowerCase();
        if (ncertClass) query['ncert.class'] = Number(ncertClass);

        const chapters = await Chapter.find(query)
            .select('chapterId subject name ncert contentSource')
            .sort({ subject: 1, 'ncert.class': 1, 'ncert.chapterNumber': 1 })
            .lean();

        const data = chapters.map((chapter) => ({
            ...chapter,
            displayName: pickLocalizedName(chapter.name, lang),
            resolvedContentSource: resolveLocalizedContentSource(chapter.contentSource, lang)
        }));

        res.status(200).json({
            success: true,
            count: data.length,
            lang,
            data
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Search/list topics with per-user quiz status
// @route   GET /api/v1/ncert-search/topics
// @access  Private
exports.getTopics = async (req, res, next) => {
    try {
        const lang = getPreferredLang(req);
        const userId = req.user._id;
        const { subject, chapterId, query, class: ncertClass } = req.query;
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);

        const topicQuery = {};
        if (subject) topicQuery.subject = String(subject).toLowerCase();
        if (chapterId) topicQuery.chapterId = String(chapterId).toLowerCase();
        if (ncertClass) {
            const classMatchedChapters = await Chapter.find({
                subject: subject ? String(subject).toLowerCase() : { $exists: true },
                'ncert.class': Number(ncertClass),
                isActive: true
            }).select('chapterId').lean();
            topicQuery.chapterId = { $in: classMatchedChapters.map((c) => c.chapterId) };
            if (chapterId) {
                topicQuery.chapterId = String(chapterId).toLowerCase();
            }
        }
        if (query && String(query).trim()) {
            const pattern = toRegex(String(query));
            topicQuery.$or = [
                { 'name.en': pattern },
                { 'name.hi': pattern },
                { topicId: pattern }
            ];
        }

        const topics = await Topic.find(topicQuery)
            .limit(limit)
            .sort({ subject: 1, chapterId: 1, 'name.en': 1 })
            .lean();

        let chapterIds = [...new Set(topics.map((t) => t.chapterId))];
        if (chapterIds.length === 0) {
            // Chapter fallback when topic collection is empty or no topic matches current filter
            const chapterFallbackQuery = { isActive: true };
            if (subject) chapterFallbackQuery.subject = String(subject).toLowerCase();
            if (ncertClass) chapterFallbackQuery['ncert.class'] = Number(ncertClass);
            if (chapterId) chapterFallbackQuery.chapterId = String(chapterId).toLowerCase();
            if (query && String(query).trim()) {
                const pattern = toRegex(String(query));
                chapterFallbackQuery.$or = [
                    { 'name.en': pattern },
                    { 'name.hi': pattern },
                    { chapterId: pattern }
                ];
            }
            const fallbackChapters = await Chapter.find(chapterFallbackQuery)
                .select('chapterId name subject ncert contentSource')
                .sort({ subject: 1, 'ncert.class': 1, 'ncert.chapterNumber': 1 })
                .limit(limit)
                .lean();

            const fallbackResults = fallbackChapters.map((chapter) => ({
                _id: `chapter-${chapter.chapterId}`,
                topicId: `chapter:${chapter.chapterId}`,
                name: chapter.name,
                displayName: pickLocalizedName(chapter.name, lang),
                subject: chapter.subject,
                chapterId: chapter.chapterId,
                chapter: {
                    chapterId: chapter.chapterId,
                    name: chapter.name,
                    displayName: pickLocalizedName(chapter.name, lang),
                    ncert: chapter.ncert,
                    contentSource: chapter.contentSource || null,
                    resolvedContentSource: resolveLocalizedContentSource(chapter.contentSource, lang)
                },
                ncertReference: null,
                contentSource: chapter.contentSource || null,
                resolvedContentSource: resolveLocalizedContentSource(chapter.contentSource, lang),
                quiz: {
                    sourceType: 'chapter',
                    available: false,
                    totalQuestions: 0,
                    hasTaken: false,
                    attempts: 0,
                    bestScore: 0,
                    lastScore: 0,
                    lastAttemptAt: null
                }
            }));

            return res.status(200).json({
                success: true,
                count: fallbackResults.length,
                lang,
                data: fallbackResults
            });
        }

        const chapters = await Chapter.find({ chapterId: { $in: chapterIds } })
            .select('chapterId name subject ncert contentSource')
            .lean();
        const chapterMap = new Map(chapters.map((c) => [c.chapterId, c]));

        const topicObjectIds = topics.map((t) => t._id);
        const [attemptAgg, topicQuestionAgg, chapterQuestionAgg] = await Promise.all([
            NcertTopicQuizAttempt.aggregate([
                {
                    $match: {
                        userId: new mongoose.Types.ObjectId(String(userId)),
                        topicObjectId: { $in: topicObjectIds }
                    }
                },
                { $sort: { createdAt: -1 } },
                {
                    $group: {
                        _id: '$topicObjectId',
                        attempts: { $sum: 1 },
                        bestScore: { $max: '$scorePercent' },
                        lastScore: { $first: '$scorePercent' },
                        lastAttemptAt: { $max: '$createdAt' }
                    }
                }
            ]),
            Question.aggregate([
                { $match: { topicId: { $in: topics.map((t) => t.topicId) }, isActive: true } },
                { $group: { _id: '$topicId', total: { $sum: 1 } } }
            ]),
            Question.aggregate([
                { $match: { chapterId: { $in: chapterIds }, isActive: true } },
                { $group: { _id: '$chapterId', total: { $sum: 1 } } }
            ])
        ]);

        const attemptsMap = new Map(attemptAgg.map((a) => [String(a._id), a]));
        const topicQuestionCountMap = new Map(topicQuestionAgg.map((a) => [a._id, a.total]));
        const chapterQuestionCountMap = new Map(chapterQuestionAgg.map((a) => [a._id, a.total]));

        const results = topics.map((topic) => {
            const chapter = chapterMap.get(topic.chapterId);
            const topicAttempt = attemptsMap.get(String(topic._id));
            const directTopicQuestionCount = topicQuestionCountMap.get(topic.topicId) || 0;
            const chapterQuestionCount = chapterQuestionCountMap.get(topic.chapterId) || 0;
            const sourceType = directTopicQuestionCount > 0 ? 'topic' : 'chapter';
            const totalQuestions = sourceType === 'topic' ? directTopicQuestionCount : chapterQuestionCount;

            return {
                _id: topic._id,
                topicId: topic.topicId,
                name: topic.name,
                displayName: pickLocalizedName(topic.name, lang),
                subject: topic.subject,
                chapterId: topic.chapterId,
                chapter: chapter
                    ? {
                        chapterId: chapter.chapterId,
                        name: chapter.name,
                        displayName: pickLocalizedName(chapter.name, lang),
                        ncert: chapter.ncert,
                        contentSource: chapter.contentSource || null,
                        resolvedContentSource: resolveLocalizedContentSource(chapter.contentSource, lang)
                    }
                    : null,
                ncertReference: topic.ncertReference || null,
                contentSource: topic.contentSource || null,
                resolvedContentSource: resolveLocalizedContentSource(topic.contentSource, lang),
                quiz: {
                    sourceType,
                    available: totalQuestions > 0,
                    totalQuestions,
                    hasTaken: Boolean(topicAttempt),
                    attempts: topicAttempt?.attempts || 0,
                    bestScore: topicAttempt?.bestScore || 0,
                    lastScore: topicAttempt?.lastScore || 0,
                    lastAttemptAt: topicAttempt?.lastAttemptAt || null
                }
            };
        });

        res.status(200).json({
            success: true,
            count: results.length,
            lang,
            data: results
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get quiz questions for a topic
// @route   GET /api/v1/ncert-search/topics/:topicObjectId/quiz
// @access  Private
exports.getTopicQuiz = async (req, res, next) => {
    try {
        const { topicObjectId } = req.params;
        const limit = Math.min(parseInt(req.query.limit, 10) || 10, 30);

        const topic = await Topic.findById(topicObjectId).lean();
        if (!topic) {
            return next(new ErrorResponse('Topic not found', 404));
        }

        const topicQuestionCount = await Question.countDocuments({
            topicId: topic.topicId,
            isActive: true
        });

        const sourceType = topicQuestionCount > 0 ? 'topic' : 'chapter';
        const matchQuery = sourceType === 'topic'
            ? { topicId: topic.topicId, isActive: true }
            : { chapterId: topic.chapterId, isActive: true };

        const rawQuestions = await Question.aggregate([
            { $match: matchQuery },
            { $sample: { size: limit } }
        ]);

        const questions = rawQuestions.map((q) => ({
            questionId: q.questionId,
            question: q.question?.en || '',
            options: (q.options || []).map((opt) => ({
                key: opt.key,
                text: opt.text?.en || opt.key
            })),
            explanation: q.explanation?.en || ''
        }));

        res.status(200).json({
            success: true,
            data: {
                topic: {
                    _id: topic._id,
                    topicId: topic.topicId,
                    name: topic.name,
                    subject: topic.subject,
                    chapterId: topic.chapterId
                },
                sourceType,
                questions
            }
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Submit topic quiz attempt and keep max score track
// @route   POST /api/v1/ncert-search/topics/:topicObjectId/quiz/submit
// @access  Private
exports.submitTopicQuiz = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { topicObjectId } = req.params;
        const { answers = [], questionIds = [], timeTaken = 0 } = req.body;

        const topic = await Topic.findById(topicObjectId).lean();
        if (!topic) {
            return next(new ErrorResponse('Topic not found', 404));
        }

        const normalizedAnswers = Array.isArray(answers) ? answers : [];
        const resolvedQuestionIds = questionIds.length > 0
            ? questionIds
            : normalizedAnswers.map((a) => a.questionId).filter(Boolean);

        if (resolvedQuestionIds.length === 0) {
            return next(new ErrorResponse('No questionIds provided for submission', 400));
        }

        const questionDocs = await Question.find({
            questionId: { $in: resolvedQuestionIds },
            isActive: true
        }).lean();

        if (questionDocs.length === 0) {
            return next(new ErrorResponse('No valid questions found for submission', 400));
        }

        const questionMap = new Map(questionDocs.map((q) => [q.questionId, q]));
        const answerMap = new Map(normalizedAnswers.map((a) => [a.questionId, a.selectedOption || null]));

        const evaluatedAnswers = resolvedQuestionIds
            .filter((qid) => questionMap.has(qid))
            .map((qid) => {
                const question = questionMap.get(qid);
                const selectedOption = answerMap.get(qid) || null;
                const isCorrect = selectedOption !== null && selectedOption === getQuestionCorrectKey(question);
                return {
                    questionId: qid,
                    selectedOption,
                    isCorrect
                };
            });

        const totalQuestions = evaluatedAnswers.length;
        const correctAnswers = evaluatedAnswers.filter((a) => a.isCorrect).length;
        const scorePercent = totalQuestions > 0
            ? Math.round((correctAnswers / totalQuestions) * 100)
            : 0;

        const hasTopicScopedQuestions = questionDocs.some((q) => q.topicId === topic.topicId);
        const sourceType = hasTopicScopedQuestions ? 'topic' : 'chapter';

        await NcertTopicQuizAttempt.create({
            userId,
            topicObjectId: topic._id,
            topicId: topic.topicId,
            chapterId: topic.chapterId,
            subject: topic.subject,
            sourceType,
            totalQuestions,
            correctAnswers,
            scorePercent,
            timeTaken: Number(timeTaken) || 0,
            answers: evaluatedAnswers
        });

        const bestAgg = await NcertTopicQuizAttempt.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(String(userId)),
                    topicObjectId: new mongoose.Types.ObjectId(String(topic._id))
                }
            },
            {
                $group: {
                    _id: '$topicObjectId',
                    attempts: { $sum: 1 },
                    bestScore: { $max: '$scorePercent' }
                }
            }
        ]);

        const best = bestAgg[0] || { attempts: 1, bestScore: scorePercent };

        res.status(200).json({
            success: true,
            data: {
                topicObjectId,
                chapterId: topic.chapterId,
                topicId: topic.topicId,
                sourceType,
                score: {
                    totalQuestions,
                    correctAnswers,
                    percentage: scorePercent
                },
                analytics: {
                    hasTaken: true,
                    attempts: best.attempts,
                    bestScore: best.bestScore
                }
            }
        });
    } catch (error) {
        next(error);
    }
};
