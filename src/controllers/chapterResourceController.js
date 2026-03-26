const ChapterResource = require('../models/ChapterResource');
const ErrorResponse = require('../utils/errorResponse');

const VALID_SUBJECTS = ['biology', 'chemistry', 'physics'];

const normalizeSubject = (subject = '') => String(subject || '').trim().toLowerCase();

const buildAvailableResourceTypes = (doc = {}) => {
    const available = [];
    if (doc.notes?.mode) available.push('notes');
    if ((doc.podcasts || []).length > 0) available.push('podcasts');
    if ((doc.crosswords || []).length > 0) available.push('crosswords');
    if ((doc.memes || []).length > 0) available.push('memes');
    if ((doc.gridlocks || []).length > 0) available.push('gridlocks');
    return available;
};

const toChapterSummary = (doc = {}) => ({
    subject: doc.subject,
    chapterName: doc.chapterName,
    slug: doc.slug,
    hasNotes: Boolean(doc.notes?.mode),
    podcastCount: Array.isArray(doc.podcasts) ? doc.podcasts.length : 0,
    crosswordCount: Array.isArray(doc.crosswords) ? doc.crosswords.length : 0,
    memeCount: Array.isArray(doc.memes) ? doc.memes.length : 0,
    gridlockCount: Array.isArray(doc.gridlocks) ? doc.gridlocks.length : 0,
    availableResourceTypes: buildAvailableResourceTypes(doc),
});

exports.getChapterResourceChapters = async (req, res, next) => {
    try {
        const subject = normalizeSubject(req.params.subject);
        if (!VALID_SUBJECTS.includes(subject)) {
            return next(new ErrorResponse(`Invalid subject. Must be one of: ${VALID_SUBJECTS.join(', ')}`, 400));
        }

        const rows = await ChapterResource.find(
            { subject },
            {
                subject: 1,
                chapterName: 1,
                slug: 1,
                notes: 1,
                podcasts: 1,
                crosswords: 1,
                memes: 1,
                gridlocks: 1,
            }
        )
            .sort({ chapterName: 1 })
            .lean();

        const data = rows.map(toChapterSummary);

        res.status(200).json({
            success: true,
            count: data.length,
            data,
        });
    } catch (error) {
        next(error);
    }
};

exports.getChapterResourceDetail = async (req, res, next) => {
    try {
        const subject = normalizeSubject(req.params.subject);
        const slug = String(req.params.slug || '').trim().toLowerCase();

        if (!VALID_SUBJECTS.includes(subject)) {
            return next(new ErrorResponse(`Invalid subject. Must be one of: ${VALID_SUBJECTS.join(', ')}`, 400));
        }

        if (!slug) {
            return next(new ErrorResponse('slug is required', 400));
        }

        const doc = await ChapterResource.findOne({ subject, slug }).lean();

        if (!doc) {
            return next(new ErrorResponse(`Chapter resource not found for ${subject}/${slug}`, 404));
        }

        res.status(200).json({
            success: true,
            data: {
                ...doc,
                hasNotes: Boolean(doc.notes?.mode),
                podcastCount: Array.isArray(doc.podcasts) ? doc.podcasts.length : 0,
                crosswordCount: Array.isArray(doc.crosswords) ? doc.crosswords.length : 0,
                memeCount: Array.isArray(doc.memes) ? doc.memes.length : 0,
                gridlockCount: Array.isArray(doc.gridlocks) ? doc.gridlocks.length : 0,
                availableResourceTypes: buildAvailableResourceTypes(doc),
            },
        });
    } catch (error) {
        next(error);
    }
};
