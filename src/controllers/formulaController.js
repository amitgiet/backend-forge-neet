const FormulaSubject = require('../models/FormulaSubject');
const FormulaTopic = require('../models/FormulaTopic');
const FormulaCard = require('../models/FormulaCard');
const FormulaProgress = require('../models/FormulaProgress');
const ErrorResponse = require('../utils/errorResponse');
const https = require('https');

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

    // More reliable direct image endpoint for <img> tags.
    return `https://lh3.googleusercontent.com/d/${fileId}`;
};

const ALLOWED_IMAGE_HOSTS = new Set([
    'drive.google.com',
    'lh3.googleusercontent.com',
    'googleusercontent.com'
]);

const isAllowedImageHost = (hostname = '') => {
    const host = String(hostname || '').toLowerCase();
    if (!host) return false;
    if (ALLOWED_IMAGE_HOSTS.has(host)) return true;
    return host.endsWith('.googleusercontent.com');
};

const toDirectFormulaImageUrl = (imageUrl = '') => {
    const raw = String(imageUrl || '').trim();
    if (!raw) return raw;
    if (!/drive\.google\.com|googleusercontent\.com/i.test(raw)) return raw;

    const fileId = extractDriveFileId(raw);
    if (!fileId) return raw;
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`;
};

const downloadImageBuffer = (urlString, redirectCount = 0) => new Promise((resolve, reject) => {
    if (redirectCount > 5) {
        return reject(new Error('Too many redirects'));
    }

    let parsed;
    try {
        parsed = new URL(urlString);
    } catch (error) {
        return reject(new Error('Invalid image URL'));
    }

    if (parsed.protocol !== 'https:') {
        return reject(new Error('Only HTTPS image URLs are allowed'));
    }
    if (!isAllowedImageHost(parsed.hostname)) {
        return reject(new Error('Image host is not allowed'));
    }

    const req = https.get(parsed, {
        headers: {
            'User-Agent': 'NEETForge-Formula-Proxy/1.0'
        }
    }, (upstream) => {
        const status = upstream.statusCode || 500;

        if ([301, 302, 303, 307, 308].includes(status)) {
            const location = upstream.headers.location;
            if (!location) {
                return reject(new Error('Redirect without location'));
            }
            const nextUrl = new URL(location, parsed).toString();
            upstream.resume();
            return resolve(downloadImageBuffer(nextUrl, redirectCount + 1));
        }

        if (status < 200 || status >= 300) {
            const chunks = [];
            upstream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            upstream.on('end', () => reject(new Error(`Upstream status ${status}`)));
            return;
        }

        const contentType = String(upstream.headers['content-type'] || '').split(';')[0].trim();
        if (!contentType.startsWith('image/')) {
            const chunks = [];
            upstream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            upstream.on('end', () => reject(new Error('Upstream did not return image content')));
            return;
        }

        const chunks = [];
        upstream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        upstream.on('end', () => resolve({
            contentType,
            body: Buffer.concat(chunks)
        }));
    });

    req.setTimeout(30000, () => {
        req.destroy(new Error('Image request timed out'));
    });
    req.on('error', reject);
});

// Proxy formula image to avoid Google direct-link throttling in browser
exports.proxyFormulaImage = async (req, res, next) => {
    try {
        const rawUrl = String(req.query.url || '').trim();
        if (!rawUrl) {
            return next(new ErrorResponse('url query param is required', 400));
        }

        const normalized = normalizeFormulaImageUrl(rawUrl);
        const result = await downloadImageBuffer(normalized, 0);

        res.setHeader('Content-Type', result.contentType || 'image/webp');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=86400');
        return res.status(200).send(result.body);
    } catch (error) {
        return next(new ErrorResponse(`Image proxy failed: ${error.message}`, 502));
    }
};

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
        const { getMarksChapterId } = req.params;

        // Find the chapter title first via the subject array if needed, or query topics directly
        // The scraping script saved topics with chapterTitle and getMarksTopicId.
        // It didn't save getMarksChapterId on the topic, but it saved chapterTitle. 
        // Let's rely on finding the chapterTitle from the FormulaSubject or passing chapterTitle in the URL.

        // In this case, let's just query topics by chapterTitle
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

        const cardsRaw = await FormulaCard.find({ topicTitle }).sort({ position: 1 }).lean();
        const cards = cardsRaw.map((card) => ({
            ...card,
            imgUrl: toDirectFormulaImageUrl(card.imgUrl)
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

// Update progress for a specific card
exports.updateCardProgress = async (req, res, next) => {
    try {
        const { cardId } = req.params;
        const { status, isBookmarked, chapterTitle, topicTitle } = req.body;

        // Upsert progress
        const progress = await FormulaProgress.findOneAndUpdate(
            { userId: req.user.id, cardId },
            {
                userId: req.user.id,
                cardId,
                ...(status !== undefined && { status }),
                ...(isBookmarked !== undefined && { isBookmarked }),
                ...(chapterTitle && { chapterTitle }),
                ...(topicTitle && { topicTitle }),
                lastSeenAt: Date.now()
            },
            { new: true, upsert: true }
        );

        if (status === 'memorized') {
            const UserActivityService = require('../services/userActivityService');
            await UserActivityService.logActivity(req.user.id, 'formula_memorized', {
                cardId,
                chapterTitle: progress.chapterTitle,
                topicTitle: progress.topicTitle
            });
        }

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
        const rows = await FormulaProgress.find({ userId: req.user.id, topicTitle })
            .populate('cardId', 'title imgUrl subjectTitle chapterTitle topicTitle position')
            .lean();

        const progress = rows.map((row) => {
            const card = row.cardId && typeof row.cardId === 'object' ? row.cardId : null;
            return {
                ...row,
                cardId: card?._id || row.cardId,
                imgUrl: toDirectFormulaImageUrl(card?.imgUrl || '')
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

// Get progress summary for a chapter
exports.getChapterProgressSummary = async (req, res, next) => {
    try {
        const { chapterTitle } = req.params;
        const rows = await FormulaProgress.find({ userId: req.user.id, chapterTitle })
            .populate('cardId', 'title imgUrl subjectTitle chapterTitle topicTitle position')
            .lean();
        const progress = rows.map((row) => {
            const card = row.cardId && typeof row.cardId === 'object' ? row.cardId : null;
            return {
                ...row,
                cardId: card?._id || row.cardId,
                imgUrl: toDirectFormulaImageUrl(card?.imgUrl || '')
            };
        });
        res.status(200).json({
            success: true,
            data: progress // Return the array of progress documents, frontend will aggregate
        });
    } catch (error) {
        next(error);
    }
};
