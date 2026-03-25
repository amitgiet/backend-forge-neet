const Question = require('../models/Question');
const ImportedQuestion = require('../models/ImportedQuestion');
const User = require('../models/User');
const NeuronzService = require('../services/neuronzService');
const ErrorResponse = require('../utils/errorResponse');

const normalizeDiagramRef = (value = '') =>
    String(value || '')
        .trim()
        .replace(/^diagram\s*\(/i, '')
        .replace(/\)\s*$/i, '')
        .trim();

const toDirectQuestionImageUrl = (imageUrl = '') => {
    const raw = String(imageUrl || '').trim();
    if (!raw) return null;
    if (!/drive\.google\.com|googleusercontent\.com/i.test(raw)) return raw;

    const match = raw.match(/(?:id=|\/d\/)([-\w]{10,})/i);
    const fileId = match?.[1];
    if (!fileId) return raw;
    return `https://lh3.googleusercontent.com/d/${fileId}`;
};

const buildQuestionCandidates = async (questionId, subject) => {
    const candidates = [];
    const baseSubject = subject ? String(subject).toLowerCase() : null;

    if (questionId) {
        const query = { questionId: String(questionId) };
        if (baseSubject) query.subject = baseSubject;

        const [questionDoc, importedDoc] = await Promise.all([
            Question.findOne({ questionId: String(questionId) }).lean(),
            ImportedQuestion.findOne(query).lean(),
        ]);
        if (questionDoc) candidates.push(questionDoc);
        if (importedDoc) candidates.push(importedDoc);
    }

    if (subject) {
        candidates.push({ subject: String(subject).toLowerCase() });
    }

    return candidates;
};

const findDiagramImageUrl = async ({ ref, questionId, subject, fallbackImageUrl }) => {
    const normalizedRef = normalizeDiagramRef(ref);
    if (!normalizedRef) {
        return { ref: normalizedRef, imageUrl: null, status: 'missing' };
    }

    const directFallback = toDirectQuestionImageUrl(fallbackImageUrl);
    if (directFallback) {
        return { ref: normalizedRef, imageUrl: directFallback, status: 'resolved' };
    }

    const refVariants = Array.from(new Set([
        normalizedRef,
        normalizedRef.toLowerCase(),
        normalizedRef.toUpperCase(),
    ]));

    const baseSubject = subject ? String(subject).toLowerCase() : null;
    const [questionDoc, importedDoc] = await Promise.all([
        Question.findOne({
            $or: [
                { imageId: { $in: refVariants } },
                { questionId: { $in: refVariants } },
            ],
            ...(baseSubject ? { subject: baseSubject } : {}),
            imageUrl: { $exists: true, $ne: null, $ne: '' },
        }).lean(),
        ImportedQuestion.findOne({
            $or: [
                { imageId: { $in: refVariants } },
                { questionId: { $in: refVariants } },
            ],
            ...(baseSubject ? { subject: baseSubject } : {}),
            imageUrl: { $exists: true, $ne: null, $ne: '' },
        }).lean(),
    ]);

    const resolved = toDirectQuestionImageUrl(questionDoc?.imageUrl || importedDoc?.imageUrl || '');
    if (resolved) {
        return { ref: normalizedRef, imageUrl: resolved, status: 'resolved' };
    }

    // Final fallback: reuse the current question's explicit image if available.
    const currentCandidates = await buildQuestionCandidates(questionId, subject);
    const currentImage = currentCandidates.find((item) => item?.imageUrl)?.imageUrl;
    const currentResolved = toDirectQuestionImageUrl(currentImage);
    if (currentResolved) {
        return { ref: normalizedRef, imageUrl: currentResolved, status: 'resolved' };
    }

    return { ref: normalizedRef, imageUrl: null, status: 'missing' };
};

// @desc    Get questions for practice (Practice Mode)
// @route   GET /api/v1/questions/practice
// @access  Private
exports.getPracticeQuestions = async (req, res, next) => {
    try {
        const { subject, chapterId, topicId, difficulty, limit = 10 } = req.query;

        const query = { isActive: true };
        if (subject) query.subject = subject;
        if (chapterId) query.chapterId = chapterId;
        if (topicId) query.topicId = topicId;
        if (difficulty) query.difficulty = difficulty;

        // Randomize selection
        const questions = await Question.aggregate([
            { $match: query },
            { $sample: { size: parseInt(limit) } }
        ]);

        res.status(200).json({
            success: true,
            count: questions.length,
            data: questions
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get random questions (legacy endpoint for frontend)
// @route   POST /api/v1/questions/random
// @access  Private
exports.getRandomQuestions = async (req, res, next) => {
    try {
        const { chapterId, subject, difficulty, examType, limit = 20 } = req.body || {};
        const questions = await Question.getRandomQuestions(
            { chapterId, subject, difficulty, examType },
            parseInt(limit)
        );

        res.status(200).json({
            success: true,
            count: questions.length,
            data: questions
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get "Due" questions for Spaced Repetition (Neuronz)
// @route   GET /api/v1/questions/neuronz/due
// @access  Private
exports.getNeuronzRevision = async (req, res, next) => {
    try {
        const dueItems = await NeuronzService.getDueQuestions(req.user.id);

        if (!dueItems || dueItems.length === 0) {
            return res.status(200).json({
                success: true,
                message: "No questions due for revision today!",
                data: []
            });
        }

        // Extract Question IDs
        const questionIds = dueItems.map(item => item.questionId);

        // Fetch full question details
        const questions = await Question.find({
            questionId: { $in: questionIds },
            isActive: true
        });

        res.status(200).json({
            success: true,
            count: questions.length,
            data: questions,
            meta: {
                dueCount: dueItems.length
            }
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Submit answer for a single question (Updates Neuronz Level)
// @route   POST /api/v1/questions/submit
// @access  Private
exports.submitQuestion = async (req, res, next) => {
    try {
        const { questionId, selectedOption, timeSpent } = req.body;

        const question = await Question.findOne({ questionId });
        if (!question) return next(new ErrorResponse('Question not found', 404));

        const isCorrect = selectedOption === question.correctAnswer;

        // 1. Update Global Question Stats
        question.updateStats(isCorrect, timeSpent || 0);
        await question.save();

        // 2. Update Neuronz Level (User-specific)
        const updatedProgress = await NeuronzService.updateProgress(req.user.id, questionId, isCorrect);

        // 3. Update generic user analytics
        const user = await User.findById(req.user.id);
        user.analytics.totalQuestionsAttempted += 1;
        if (isCorrect) user.analytics.totalQuestionsCorrect += 1;
        await user.save();

        res.status(200).json({
            success: true,
            isCorrect,
            explanation: question.explanation,
            neuronz: {
                newLevel: updatedProgress.level,
                nextRevision: updatedProgress.nextRevisionDate
            }
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Resolve diagram markers to image URLs
// @route   POST /api/v1/questions/resolve-diagrams
// @access  Private
exports.resolveDiagramMarkers = async (req, res, next) => {
    try {
        const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
        const items = rawItems
            .map((item) => ({
                questionId: item?.questionId ? String(item.questionId) : null,
                subject: item?.subject ? String(item.subject).toLowerCase() : null,
                questionRefs: Array.isArray(item?.questionRefs) ? item.questionRefs.map((ref) => normalizeDiagramRef(ref)).filter(Boolean) : [],
                explanationRefs: Array.isArray(item?.explanationRefs) ? item.explanationRefs.map((ref) => normalizeDiagramRef(ref)).filter(Boolean) : [],
                refs: Array.isArray(item?.refs) ? item.refs.map((ref) => normalizeDiagramRef(ref)).filter(Boolean) : [],
                fallbackImageUrl: item?.imageUrl ? String(item.imageUrl) : null,
            }))
            .filter((item) => item.questionId || item.questionRefs.length > 0 || item.explanationRefs.length > 0 || item.refs.length > 0);

        if (!items.length) {
            return res.status(400).json({
                success: false,
                error: 'items with questionId and refs are required',
            });
        }

        const resolvedItems = await Promise.all(
            items.map(async (item) => {
                const uniqueRefs = Array.from(new Set([
                    ...item.questionRefs,
                    ...item.explanationRefs,
                    ...item.refs,
                ]));
                const resolved = await Promise.all(
                    uniqueRefs.map((ref) =>
                        findDiagramImageUrl({
                            ref,
                            questionId: item.questionId,
                            subject: item.subject,
                            fallbackImageUrl: item.fallbackImageUrl,
                        })
                    )
                );
                return {
                    questionId: item.questionId,
                    resolved,
                };
            })
        );

        res.status(200).json({
            success: true,
            data: {
                items: resolvedItems,
            },
        });
    } catch (error) {
        next(error);
    }
};
