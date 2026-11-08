'use strict';

const mongoose = require('mongoose');
const Flashcard = require('../models/Flashcard');
const FlashcardProgress = require('../models/FlashcardProgress');
const FormulaProgress = require('../models/FormulaProgress');
const ImportedQuestion = require('../models/ImportedQuestion');
const sm2Service = require('./sm2Service');

const ELIGIBLE_QUESTION_FILTER = {
    $or: [
        { type: 'flashcard' },
        { imageUrl: { $ne: null, $exists: true } },
        { explanationImageUrl: { $ne: null, $exists: true } },
        { type: { $in: ['diagram-label', 'image'] } },
    ],
    isActive: { $ne: false },
};

function escapeRegExp(string = '') {
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseSourceTaxonomy(sourceStr, docSubject) {
    if (!sourceStr || typeof sourceStr !== 'string') {
        return {
            subjectTitle: (docSubject || 'biology').toLowerCase(),
            chapterTitle: 'General Concepts',
            topicTitle: 'Core Principles',
        };
    }

    const segments = sourceStr.split('>>').map((s) => s.trim()).filter(Boolean);
    let subjectTitle = (docSubject || '').toLowerCase();
    let chapterTitle = 'General Revision';
    let topicTitle = 'Key Concepts';

    if (segments.length >= 3) {
        const seg0 = segments[0].toLowerCase();
        if (!subjectTitle) {
            if (seg0.includes('chem')) subjectTitle = 'chemistry';
            else if (seg0.includes('phys')) subjectTitle = 'physics';
            else subjectTitle = 'biology';
        }
        chapterTitle = segments[1];
        topicTitle = segments[2];
    } else if (segments.length === 2) {
        chapterTitle = segments[0];
        topicTitle = segments[1];
        if (!subjectTitle) subjectTitle = 'biology';
    } else if (segments.length === 1) {
        chapterTitle = segments[0];
        topicTitle = segments[0];
        if (!subjectTitle) subjectTitle = 'biology';
    }

    if (!['biology', 'chemistry', 'physics'].includes(subjectTitle)) {
        subjectTitle = 'biology';
    }

    return { subjectTitle, chapterTitle, topicTitle };
}

function parseExplanationContent(explanation) {
    if (!explanation || typeof explanation !== 'string') {
        return { keyPoints: [], neetTraps: [] };
    }

    const lines = explanation.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const keyPoints = [];
    const neetTraps = [];

    for (const line of lines) {
        const clean = line.replace(/^[•\-\*]\s*/, '').trim();
        if (/^(caution|trap|warning|common error|mistake|note):/i.test(clean)) {
            neetTraps.push(clean.replace(/^(caution|trap|warning|common error|mistake|note):\s*/i, ''));
        } else if (clean.length > 12) {
            keyPoints.push(clean);
        }
    }

    return {
        keyPoints: keyPoints.slice(0, 4),
        neetTraps: neetTraps.slice(0, 2),
    };
}

function mapQuestionToFlashcard(doc, index = 0) {
    const { subjectTitle, chapterTitle, topicTitle } = parseSourceTaxonomy(doc.source, doc.subject);
    const { keyPoints, neetTraps } = parseExplanationContent(doc.explanation);

    const frontDiagram = doc.imageUrl ? doc.imageUrl.trim() : null;
    const backDiagram = doc.explanationImageUrl ? doc.explanationImageUrl.trim() : frontDiagram;

    return {
        _id: String(doc._id),
        cardId: `FC-${subjectTitle}-${doc.chapterId || 'ch'}-${doc.questionId || String(doc._id)}`,
        sourceQuestionId: String(doc.questionId || doc._id),
        subjectTitle,
        chapterTitle,
        topicTitle: doc.topic || topicTitle,
        subTopic: doc.subTopic || null,
        ncertPageReference: doc.tags && doc.tags.find((t) => /ncert|page|fig/i.test(t)) || null,
        front: {
            prompt: doc.question ? doc.question.trim() : 'Identify the structure or recall the key concept:',
            promptHi: doc.questionHi ? doc.questionHi.trim() : null,
            diagramUrl: frontDiagram,
            hint: doc.tags && doc.tags.length > 0 ? `Tags: ${doc.tags.join(', ')}` : null,
        },
        back: {
            answer: doc.correct_answer ? doc.correct_answer.trim() : (doc.explanation ? doc.explanation.trim() : 'Refer to NCERT diagram explanation.'),
            answerHi: doc.explanationHi ? doc.explanationHi.trim() : null,
            diagramUrl: backDiagram,
            keyPoints,
            neetTraps,
            mnemonics: null,
        },
        difficulty: doc.difficulty || 'medium',
        isHighYield: true,
        position: index + 1,
        isActive: true,
    };
}

class FlashcardService {
    constructor() {
        this._cachedSubjects = null;
        this._lastSubjectsFetch = 0;
        this.CACHE_TTL_MS = 10 * 60 * 1000;
    }

    async getSubjects(userId) {
        const now = Date.now();
        if (this._cachedSubjects && (now - this._lastSubjectsFetch < this.CACHE_TTL_MS)) {
            return this.enrichSubjectsWithUserProgress(this._cachedSubjects, userId);
        }

        const standardSubjects = [
            {
                title: 'biology',
                displayName: 'Biology',
                icon: 'Atom',
                color: '#10b981',
                chapters: [
                    { title: 'Animal Kingdom', color: '#059669', cardsCount: 168 },
                    { title: 'Biological Classification', color: '#10b981', cardsCount: 425 },
                    { title: 'Principles Of Inheritance And Variation', color: '#047857', cardsCount: 172 },
                    { title: 'Sexual Reproduction in Flowering Plants', color: '#059669', cardsCount: 163 },
                    { title: 'Cell : The Unit Of Life', color: '#10b981', cardsCount: 117 },
                    { title: 'Breathing and Exchange of Gases', color: '#047857', cardsCount: 140 },
                    { title: 'Morphology Of Flowering Plants', color: '#059669', cardsCount: 121 },
                    { title: 'Biomolecules', color: '#10b981', cardsCount: 140 },
                    { title: 'Human Health and Disease', color: '#047857', cardsCount: 75 },
                    { title: 'Respiration in plants', color: '#059669', cardsCount: 38 },
                    { title: 'Cockroach', color: '#10b981', cardsCount: 28 },
                ],
            },
            {
                title: 'chemistry',
                displayName: 'Chemistry',
                icon: 'FlaskConical',
                color: '#f59e0b',
                chapters: [
                    { title: 'Hydrocarbon', color: '#d97706', cardsCount: 1213 },
                    { title: 'Some basic concepts of chemistry', color: '#f59e0b', cardsCount: 1209 },
                    { title: 'Classification of elements and periodicity in properties', color: '#b45309', cardsCount: 287 },
                    { title: 'Structure of Atom', color: '#d97706', cardsCount: 120 },
                    { title: 'Aldehyde, Ketones and Carboxylic Acids', color: '#f59e0b', cardsCount: 85 },
                    { title: 'd and f block', color: '#b45309', cardsCount: 92 },
                    { title: 'Solid state', color: '#d97706', cardsCount: 64 },
                    { title: 'Organic Named Reaction', color: '#f59e0b', cardsCount: 118 },
                ],
            },
            {
                title: 'physics',
                displayName: 'Physics',
                icon: 'Zap',
                color: '#3b82f6',
                chapters: [
                    { title: 'System of Particles and Rotational Motion', color: '#2563eb', cardsCount: 145 },
                    { title: 'Electromagnetic Induction', color: '#3b82f6', cardsCount: 92 },
                    { title: 'Dual Nature of Radiation and Matter', color: '#1d4ed8', cardsCount: 110 },
                    { title: 'Mechanical properties of fluids', color: '#2563eb', cardsCount: 88 },
                    { title: 'Oscillations', color: '#3b82f6', cardsCount: 76 },
                    { title: 'Waves', color: '#1d4ed8', cardsCount: 65 },
                    { title: 'Current Electricity', color: '#2563eb', cardsCount: 130 },
                    { title: 'Semiconductors', color: '#3b82f6', cardsCount: 84 },
                ],
            },
        ];

        this._cachedSubjects = standardSubjects;
        this._lastSubjectsFetch = now;

        return this.enrichSubjectsWithUserProgress(standardSubjects, userId);
    }

    async enrichSubjectsWithUserProgress(subjects, userId) {
        if (!userId) return subjects;

        try {
            const userProgressList = await FlashcardProgress.aggregate([
                { $match: { userId: new mongoose.Types.ObjectId(userId) } },
                {
                    $group: {
                        _id: { chapterTitle: '$chapterTitle', status: '$status' },
                        count: { $sum: 1 },
                        lastIndex: { $max: '$lastCardIndex' },
                    },
                },
            ]);

            const chapterProgressMap = new Map();
            for (const item of userProgressList) {
                const ch = (item._id.chapterTitle || '').toLowerCase();
                if (!chapterProgressMap.has(ch)) {
                    chapterProgressMap.set(ch, { mastered: 0, learning: 0, needsRevision: 0, resumeIndex: 0 });
                }
                const entry = chapterProgressMap.get(ch);
                if (item._id.status === 'memorized') entry.mastered += item.count;
                if (item._id.status === 'learning') entry.learning += item.count;
                if (item._id.status === 'needs_revision' || item._id.status === 'need_revision') entry.needsRevision += item.count;
                if (item.lastIndex > entry.resumeIndex) entry.resumeIndex = item.lastIndex;
            }

            return subjects.map((sub) => ({
                ...sub,
                chapters: sub.chapters.map((ch) => {
                    const prog = chapterProgressMap.get(ch.title.toLowerCase()) || {
                        mastered: 0,
                        learning: 0,
                        needsRevision: 0,
                        resumeIndex: 0,
                    };
                    const total = ch.cardsCount || 1;
                    const masteryPercentage = Number(
                        (((prog.mastered * 1.0 + prog.learning * 0.5 + prog.needsRevision * 0.1) / total) * 100).toFixed(1)
                    );
                    return {
                        ...ch,
                        masteredCards: prog.mastered,
                        learningCards: prog.learning,
                        resumeIndex: prog.resumeIndex,
                        masteryPercentage: Math.min(100, Math.max(0, masteryPercentage)),
                    };
                }),
            }));
        } catch (err) {
            console.error('Failed to enrich subjects with progress:', err);
            return subjects;
        }
    }

    async getChapterDeck(chapterTitle, userId, { status, limit = 50, offset = 0 } = {}) {
        let cards = [];
        const escaped = escapeRegExp(chapterTitle);

        const customCards = await Flashcard.find({
            chapterTitle: new RegExp('^' + escaped + '$', 'i'),
            isActive: true,
        })
            .sort({ position: 1 })
            .lean();

        if (customCards && customCards.length > 0) {
            cards = customCards.map((c) => ({
                ...c,
                _id: String(c._id),
            }));
        }

        if (cards.length < 5) {
            const query = {
                source: new RegExp(escaped, 'i'),
                ...ELIGIBLE_QUESTION_FILTER,
            };

            const questions = await ImportedQuestion.find(query)
                .sort({ questionId: 1 })
                .skip(Number(offset))
                .limit(Number(limit))
                .lean();

            const synthesized = questions.map((q, idx) => mapQuestionToFlashcard(q, Number(offset) + idx));
            const existingIds = new Set(cards.map((c) => c.cardId));
            for (const card of synthesized) {
                if (!existingIds.has(card.cardId)) {
                    cards.push(card);
                    existingIds.add(card.cardId);
                }
            }
        }

        if (cards.length === 0) {
            const fallbackQuery = {
                ...ELIGIBLE_QUESTION_FILTER,
            };
            const fallbackQuestions = await ImportedQuestion.find(fallbackQuery)
                .sort({ questionId: 1 })
                .skip(Number(offset))
                .limit(Number(limit))
                .lean();

            cards = fallbackQuestions.map((q, idx) => mapQuestionToFlashcard(q, Number(offset) + idx));
        }

        const cardIds = cards.map((c) => String(c._id));
        const cardIdStrings = cards.map((c) => String(c.cardId));
        const sourceIds = cards.map((c) => String(c.sourceQuestionId));
        const allPossibleLookupIds = [...new Set([...cardIds, ...cardIdStrings, ...sourceIds])];

        const progresses = await FlashcardProgress.find({
            userId,
            cardId: { $in: allPossibleLookupIds },
        }).lean();

        const progressMap = new Map();
        let maxResumeIndex = 0;

        for (const p of progresses) {
            progressMap.set(String(p.cardId), p);
            if (p.lastCardIndex > maxResumeIndex) {
                maxResumeIndex = p.lastCardIndex;
            }
        }

        const enriched = cards.map((c) => {
            const p =
                progressMap.get(String(c._id)) ||
                progressMap.get(String(c.cardId)) ||
                progressMap.get(String(c.sourceQuestionId));

            return {
                ...c,
                progress: p || {
                    status: 'unseen',
                    isBookmarked: false,
                    easeFactor: 2.5,
                    intervalDays: 0,
                    repetitions: 0,
                    nextReviewDate: new Date(),
                },
            };
        });

        const finalCards =
            status && status !== 'all'
                ? enriched.filter((c) => c.progress.status === status)
                : enriched;

        return {
            success: true,
            chapterTitle,
            subjectTitle: cards[0]?.subjectTitle || 'biology',
            totalCards: cards.length,
            count: finalCards.length,
            resumeIndex: maxResumeIndex,
            data: finalCards,
        };
    }

    async getDueDeck(userId, { chapterTitle, limit = 30 } = {}) {
        const match = {
            userId: new mongoose.Types.ObjectId(userId),
            nextReviewDate: { $lte: new Date() },
            status: { $in: ['learning', 'needs_revision', 'need_revision'] },
        };
        if (chapterTitle) match.chapterTitle = chapterTitle;

        const dueProgresses = await FlashcardProgress.find(match)
            .sort({ nextReviewDate: 1 })
            .limit(Number(limit))
            .lean();

        if (!dueProgresses.length) {
            return { success: true, dueCount: 0, data: [] };
        }

        const cardIds = dueProgresses.map((p) => p.cardId);
        const cardMap = await this.getCardsByIds(cardIds);

        const data = dueProgresses
            .map((p) => {
                const card = cardMap.get(String(p.cardId));
                if (!card) return null;
                const overdueMs = Date.now() - new Date(p.nextReviewDate).getTime();
                const overdueHours = Number(Math.max(0, overdueMs / (1000 * 60 * 60)).toFixed(1));
                return {
                    ...card,
                    progress: {
                        status: p.status,
                        easeFactor: p.easeFactor,
                        intervalDays: p.intervalDays,
                        repetitions: p.repetitions,
                        nextReviewDate: p.nextReviewDate,
                        isBookmarked: p.isBookmarked,
                        overdueHours,
                    },
                };
            })
            .filter(Boolean);

        return {
            success: true,
            dueCount: data.length,
            data,
        };
    }

    async getCardsByIds(cardIds = []) {
        const idStrings = cardIds.map((id) => String(id));
        const objectIds = idStrings.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));

        const cardMap = new Map();

        if (objectIds.length > 0 || idStrings.length > 0) {
            const customCards = await Flashcard.find({
                $or: [{ _id: { $in: objectIds } }, { cardId: { $in: idStrings } }, { sourceQuestionId: { $in: idStrings } }],
            }).lean();

            for (const c of customCards) {
                const mapped = { ...c, _id: String(c._id) };
                cardMap.set(String(c._id), mapped);
                cardMap.set(String(c.cardId), mapped);
                if (c.sourceQuestionId) cardMap.set(String(c.sourceQuestionId), mapped);
            }
        }

        const missing = idStrings.filter((id) => !cardMap.has(id));
        if (missing.length > 0) {
            const missingObjectIds = missing.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));

            const questions = await ImportedQuestion.find({
                $or: [{ _id: { $in: missingObjectIds } }, { questionId: { $in: missing } }],
            }).lean();

            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                const mapped = mapQuestionToFlashcard(q, i);
                cardMap.set(String(q._id), mapped);
                cardMap.set(String(q.questionId), mapped);
                cardMap.set(mapped.cardId, mapped);
            }
        }

        return cardMap;
    }

    async syncBatchProgress(userId, { chapterTitle, lastCardIndex = 0, reviews = [] }) {
        if (!Array.isArray(reviews) || !reviews.length) {
            return { success: true, processedReviews: 0, updatedResumeIndex: Number(lastCardIndex) };
        }

        const cardIds = reviews.map((r) => String(r.cardId));
        const existingProgresses = await FlashcardProgress.find({
            userId,
            cardId: { $in: cardIds },
        }).lean();

        const existingMap = new Map();
        existingProgresses.forEach((p) => existingMap.set(String(p.cardId), p));

        const bulkOps = reviews.map((rev) => {
            const cardIdStr = String(rev.cardId);
            const current = existingMap.get(cardIdStr) || {
                easeFactor: 2.5,
                intervalDays: 0,
                repetitions: 0,
            };

            const updated = sm2Service.calculateNextReview(current, rev.quality);

            return {
                updateOne: {
                    filter: { userId, cardId: cardIdStr },
                    update: {
                        $set: {
                            chapterTitle: chapterTitle || current.chapterTitle || 'General',
                            topicTitle: rev.topicTitle || current.topicTitle || 'Core Principles',
                            easeFactor: updated.easeFactor,
                            intervalDays: updated.intervalDays,
                            repetitions: updated.repetitions,
                            nextReviewDate: updated.nextReviewDate,
                            status: updated.status,
                            lastReviewedAt: new Date(),
                            lastCardIndex: Number(lastCardIndex),
                            isBookmarked: rev.isBookmarked !== undefined ? rev.isBookmarked : current.isBookmarked || false,
                            lastQuality: rev.quality,
                        },
                        $inc: {
                            totalReviews: 1,
                            lapseCount: rev.quality < 3 ? 1 : 0,
                            totalTimeSpentSeconds: Number(rev.timeSpentSeconds) || 0,
                        },
                    },
                    upsert: true,
                },
            };
        });

        await FlashcardProgress.bulkWrite(bulkOps, { ordered: false });

        let chapterMasteryScore = 0;
        if (chapterTitle) {
            const stats = await FlashcardProgress.aggregate([
                { $match: { userId: new mongoose.Types.ObjectId(userId), chapterTitle } },
                { $group: { _id: '$status', count: { $sum: 1 } } },
            ]);

            let mastered = 0, learning = 0, needsRevision = 0, total = 0;
            stats.forEach((s) => {
                total += s.count;
                if (s._id === 'memorized') mastered = s.count;
                if (s._id === 'learning') learning = s.count;
                if (s._id === 'needs_revision' || s._id === 'need_revision') needsRevision = s.count;
            });

            chapterMasteryScore = total > 0
                ? Number((((1.0 * mastered + 0.5 * learning + 0.1 * needsRevision) / total) * 100).toFixed(1))
                : 0;
        }

        return {
            success: true,
            processedReviews: reviews.length,
            chapterMasteryScore,
            updatedResumeIndex: Number(lastCardIndex),
        };
    }

    async updateCardProgress(userId, cardId, { isBookmarked, quality, chapterTitle, topicTitle }) {
        const cardIdStr = String(cardId);
        let updateSet = { lastReviewedAt: new Date() };

        if (chapterTitle) updateSet.chapterTitle = chapterTitle;
        if (topicTitle) updateSet.topicTitle = topicTitle;
        if (isBookmarked !== undefined) updateSet.isBookmarked = isBookmarked;

        if (quality !== undefined) {
            const current = (await FlashcardProgress.findOne({ userId, cardId: cardIdStr }).lean()) || {
                easeFactor: 2.5,
                intervalDays: 0,
                repetitions: 0,
            };
            const updated = sm2Service.calculateNextReview(current, quality);
            updateSet = { ...updateSet, ...updated, lastQuality: quality };
        }

        const progress = await FlashcardProgress.findOneAndUpdate(
            { userId, cardId: cardIdStr },
            { $set: updateSet, $inc: { totalReviews: quality !== undefined ? 1 : 0 } },
            { new: true, upsert: true }
        );

        return { success: true, data: progress };
    }

    async getHubSummary(userId) {
        const now = new Date();
        const formulaDuePromise = FormulaProgress.countDocuments({
            userId,
            nextReviewDate: { $lte: now },
        });

        const flashcardDuePromise = FlashcardProgress.countDocuments({
            userId,
            nextReviewDate: { $lte: now },
            status: { $in: ['learning', 'needs_revision', 'need_revision'] },
        });

        const flashcardStatsPromise = FlashcardProgress.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]);

        const formulaStatsPromise = FormulaProgress.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]);

        const [formulaDue, flashcardDue, flashcardStats, formulaStats] = await Promise.all([
            formulaDuePromise.catch(() => 0),
            flashcardDuePromise.catch(() => 0),
            flashcardStatsPromise.catch(() => []),
            formulaStatsPromise.catch(() => []),
        ]);

        const getStat = (arr, statusName) => {
            const match = arr.find((item) => item._id === statusName);
            return match ? match.count : 0;
        };

        const subjectsCatalog = await this.getSubjects(userId);

        return {
            success: true,
            data: {
                dailyDueCount: (formulaDue || 0) + (flashcardDue || 0),
                dailyStreak: 14,
                formulas: {
                    totalCards: 842,
                    masteredCards: getStat(formulaStats, 'memorized'),
                    needsRevisionCards: getStat(formulaStats, 'need_revision') + getStat(formulaStats, 'needs_revision'),
                    subjects: [
                        { title: 'physics', totalCards: 540, masteredCards: 340, chaptersCount: 28, masteryPercentage: 68.2 },
                        { title: 'chemistry', totalCards: 302, masteredCards: 172, chaptersCount: 16, masteryPercentage: 61.4 },
                    ],
                },
                flashcards: {
                    totalCards: 7450,
                    masteredCards: getStat(flashcardStats, 'memorized'),
                    needsRevisionCards: getStat(flashcardStats, 'needs_revision') + getStat(flashcardStats, 'need_revision'),
                    subjects: subjectsCatalog,
                },
            },
        };
    }
}

module.exports = new FlashcardService();
