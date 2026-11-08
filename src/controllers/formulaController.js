const axios = require('axios');
const FormulaSubject = require('../models/FormulaSubject');
const FormulaTopic = require('../models/FormulaTopic');
const FormulaCard = require('../models/FormulaCard');
const FormulaProgress = require('../models/FormulaProgress');
const sm2Service = require('../services/sm2Service');
const ErrorResponse = require('../utils/errorResponse');
const {
    getPreferredLanguage,
    pickFormulaImageForLanguage,
} = require('../utils/languagePreference');

const extractDriveFileId = (urlValue = '') => {
    const url = String(urlValue || '').trim();
    if (!url) return null;

    const byQuery = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (byQuery?.[1]) return byQuery[1];

    const byPathD = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (byPathD?.[1]) return byPathD[1];

    const byUcPath = url.match(/\/uc\/[^?]*\?[^#]*id=([a-zA-Z0-9_-]+)/);
    if (byUcPath?.[1]) return byUcPath[1];

    return null;
};

const normalizeFormulaImageUrl = (urlValue = '') => {
    const raw = String(urlValue || '').trim();
    if (!raw) return raw;
    if (!/drive\.google\.com|googleusercontent\.com/i.test(raw)) return raw;

    const fileId = extractDriveFileId(raw);
    if (!fileId) return raw;

    return `https://lh3.googleusercontent.com/d/${fileId}`;
};

const toDirectFormulaImageUrl = (imageUrl = '') => {
    const raw = String(imageUrl || '').trim();
    if (!raw) return raw;
    if (!/drive\.google\.com|googleusercontent\.com/i.test(raw)) return raw;

    const fileId = extractDriveFileId(raw);
    if (!fileId) return raw;
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`;
};

// Zero-RAM Image Stream Piping
exports.proxyDiagramImage = async (req, res, next) => {
    try {
        const driveUrl = req.query.driveUrl || req.query.url;
        if (!driveUrl) {
            return res.status(400).json({ success: false, error: 'Valid image URL required' });
        }

        const normalized = normalizeFormulaImageUrl(driveUrl);

        const upstream = await axios.get(normalized, {
            responseType: 'stream',
            timeout: 10000,
            headers: {
                'User-Agent': 'NEETForge-Formula-Proxy/1.0'
            }
        });

        res.setHeader('Content-Type', upstream.headers['content-type'] || 'image/webp');
        res.setHeader('Cache-Control', 'public, max-age=604800');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Origin', '*');

        upstream.data.pipe(res);
    } catch (err) {
        next(err);
    }
};

exports.proxyFormulaImage = exports.proxyDiagramImage;

exports.getFormulaSubjects = async (req, res, next) => {
    try {
        const subjects = await FormulaSubject.find().sort({ position: 1 });
        res.status(200).json({
            success: true,
            data: subjects
        });
    } catch (error) {
        next(error);
    }
};

exports.getFormulaTopics = async (req, res, next) => {
    try {
        const { chapterTitle } = req.query;

        let query = {};
        if (chapterTitle) {
            query.chapterTitle = chapterTitle;
        }

        const topics = await FormulaTopic.find(query).sort({ position: 1 });

        res.status(200).json({
            success: true,
            count: topics.length,
            data: topics
        });
    } catch (error) {
        next(error);
    }
};

exports.getFormulaCards = async (req, res, next) => {
    try {
        const { topicTitle } = req.params;
        const language = getPreferredLanguage(req);

        const cardsRaw = await FormulaCard.find({ topicTitle }).sort({ position: 1 }).lean();
        const cards = cardsRaw.map((card) => ({
            ...card,
            imgUrl: toDirectFormulaImageUrl(pickFormulaImageForLanguage(card, language)),
            hindiImgUrl: toDirectFormulaImageUrl(card.hindiImgUrl || '')
        }));

        res.status(200).json({
            success: true,
            count: cards.length,
            data: cards
        });
    } catch (error) {
        next(error);
    }
};

// High-Speed SM-2 Due Deck Query
exports.getDueDeck = async (req, res, next) => {
    try {
        const userId = req.user._id || req.user.id;
        const { chapterTitle, topicTitle, limit = 50 } = req.query;

        const query = {
            userId,
            nextReviewDate: { $lte: new Date() }
        };

        if (chapterTitle) query.chapterTitle = chapterTitle;
        if (topicTitle) query.topicTitle = topicTitle;

        const dueItems = await FormulaProgress.find(query)
            .sort({ nextReviewDate: 1 })
            .limit(parseInt(limit, 10))
            .populate('cardId')
            .lean();

        const language = getPreferredLanguage(req);
        const cards = dueItems
            .filter(d => d.cardId)
            .map(d => ({
                ...d.cardId,
                imgUrl: toDirectFormulaImageUrl(pickFormulaImageForLanguage(d.cardId, language)),
                hindiImgUrl: toDirectFormulaImageUrl(d.cardId.hindiImgUrl || ''),
                progress: {
                    easeFactor: d.easeFactor,
                    intervalDays: d.intervalDays,
                    repetitions: d.repetitions,
                    status: d.status,
                    nextReviewDate: d.nextReviewDate,
                    lastReviewedAt: d.lastReviewedAt
                }
            }));

        res.status(200).json({
            success: true,
            count: cards.length,
            data: cards
        });
    } catch (err) {
        next(err);
    }
};

// High-Speed SM-2 Batch Synchronization via bulkWrite
exports.syncFormulaBatch = async (req, res, next) => {
    try {
        const { reviews } = req.body;
        const userId = req.user._id || req.user.id;

        if (!Array.isArray(reviews) || reviews.length === 0) {
            return res.status(400).json({ success: false, error: 'Reviews array required' });
        }

        const cardIds = reviews.map(r => r.cardId);
        const existingDocs = await FormulaProgress.find({ userId, cardId: { $in: cardIds } }).lean();
        const docMap = new Map(existingDocs.map(d => [d.cardId.toString(), d]));

        const bulkOps = reviews.map(rev => {
            const current = docMap.get(rev.cardId.toString()) || {
                easeFactor: 2.5,
                intervalDays: 0,
                repetitions: 0
            };

            const updated = sm2Service.calculateNextReview(current, rev.quality);

            return {
                updateOne: {
                    filter: { userId, cardId: rev.cardId },
                    update: {
                        $set: {
                            chapterTitle: rev.chapterTitle,
                            topicTitle: rev.topicTitle,
                            easeFactor: updated.easeFactor,
                            intervalDays: updated.intervalDays,
                            repetitions: updated.repetitions,
                            nextReviewDate: updated.nextReviewDate,
                            status: updated.status,
                            lastReviewedAt: new Date()
                        }
                    },
                    upsert: true
                }
            };
        });

        await FormulaProgress.bulkWrite(bulkOps, { ordered: false });

        res.status(200).json({ success: true, count: reviews.length });
    } catch (err) {
        next(err);
    }
};

// Chapter Summary Aggregation (< 25ms index-covered)
exports.getChapterSummary = async (req, res, next) => {
    try {
        const chapter = req.params.chapter || req.params.chapterTitle;
        const userId = req.user._id || req.user.id;

        const stats = await FormulaProgress.aggregate([
            { $match: { userId, chapterTitle: chapter } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const summary = { unseen: 0, learning: 0, memorized: 0, need_revision: 0 };
        stats.forEach(s => {
            if (summary[s._id] !== undefined) summary[s._id] = s.count;
        });

        res.status(200).json({ success: true, summary });
    } catch (err) {
        next(err);
    }
};

// Update progress for a single card
exports.updateCardProgress = async (req, res, next) => {
    try {
        const { cardId } = req.params;
        const { status, isBookmarked, chapterTitle, topicTitle, quality } = req.body;
        const userId = req.user._id || req.user.id;

        let sm2Update = {};
        if (quality !== undefined) {
            const current = await FormulaProgress.findOne({ userId, cardId }).lean() || {
                easeFactor: 2.5,
                intervalDays: 0,
                repetitions: 0
            };
            sm2Update = sm2Service.calculateNextReview(current, quality);
        }

        const progress = await FormulaProgress.findOneAndUpdate(
            { userId, cardId },
            {
                userId,
                cardId,
                ...(status !== undefined && { status }),
                ...(isBookmarked !== undefined && { isBookmarked }),
                ...(chapterTitle && { chapterTitle }),
                ...(topicTitle && { topicTitle }),
                ...sm2Update,
                lastReviewedAt: new Date()
            },
            { new: true, upsert: true }
        );

        res.status(200).json({
            success: true,
            data: progress
        });
    } catch (error) {
        next(error);
    }
};

// Get progress for a topic
exports.getTopicProgress = async (req, res, next) => {
    try {
        const { topicTitle } = req.params;
        const userId = req.user._id || req.user.id;
        const language = getPreferredLanguage(req);
        const rows = await FormulaProgress.find({ userId, topicTitle })
            .populate('cardId', 'title imgUrl hindiImgUrl subjectTitle chapterTitle topicTitle position')
            .lean();

        const progress = rows.map((row) => {
            const card = row.cardId && typeof row.cardId === 'object' ? row.cardId : null;
            return {
                ...row,
                cardId: card?._id || row.cardId,
                imgUrl: toDirectFormulaImageUrl(pickFormulaImageForLanguage(card, language))
            };
        });
        res.status(200).json({
            success: true,
            data: progress
        });
    } catch (error) {
        next(error);
    }
};

// Get progress summary for a chapter (legacy endpoint)
exports.getChapterProgressSummary = async (req, res, next) => {
    try {
        const chapterTitle = req.params.chapterTitle || req.params.chapter;
        const userId = req.user._id || req.user.id;
        const language = getPreferredLanguage(req);
        const rows = await FormulaProgress.find({ userId, chapterTitle })
            .populate('cardId', 'title imgUrl hindiImgUrl subjectTitle chapterTitle topicTitle position')
            .lean();
        const progress = rows.map((row) => {
            const card = row.cardId && typeof row.cardId === 'object' ? row.cardId : null;
            return {
                ...row,
                cardId: card?._id || row.cardId,
                imgUrl: toDirectFormulaImageUrl(pickFormulaImageForLanguage(card, language))
            };
        });
        res.status(200).json({
            success: true,
            data: progress
        });
    } catch (error) {
        next(error);
    }
};
