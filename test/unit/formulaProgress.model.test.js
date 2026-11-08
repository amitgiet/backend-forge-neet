const mongoose = require('mongoose');
const FormulaProgress = require('../../src/models/FormulaProgress');

describe('FormulaProgress Model Schema & Constraints', () => {
    test('validates required fields: userId, cardId, chapterTitle, topicTitle', () => {
        const progress = new FormulaProgress({});
        const err = progress.validateSync();

        expect(err.errors.userId).toBeDefined();
        expect(err.errors.cardId).toBeDefined();
        expect(err.errors.chapterTitle).toBeDefined();
        expect(err.errors.topicTitle).toBeDefined();
    });

    test('sets default values for SM-2 spaced repetition fields', () => {
        const progress = new FormulaProgress({
            userId: new mongoose.Types.ObjectId(),
            cardId: new mongoose.Types.ObjectId(),
            chapterTitle: 'Rotational Motion',
            topicTitle: 'Moment of Inertia'
        });

        expect(progress.status).toBe('unseen');
        expect(progress.easeFactor).toBe(2.5);
        expect(progress.intervalDays).toBe(0);
        expect(progress.repetitions).toBe(0);
        expect(progress.isBookmarked).toBe(false);
        expect(progress.nextReviewDate).toBeDefined();
    });

    test('validates status enum strictly', () => {
        const validStatuses = ['unseen', 'learning', 'memorized', 'need_revision'];

        for (const status of validStatuses) {
            const progress = new FormulaProgress({
                userId: new mongoose.Types.ObjectId(),
                cardId: new mongoose.Types.ObjectId(),
                chapterTitle: 'Thermodynamics',
                topicTitle: 'Carnot Engine',
                status
            });
            expect(progress.validateSync()?.errors?.status).toBeUndefined();
        }

        const invalid = new FormulaProgress({
            userId: new mongoose.Types.ObjectId(),
            cardId: new mongoose.Types.ObjectId(),
            chapterTitle: 'Thermodynamics',
            topicTitle: 'Carnot Engine',
            status: 'mastered' // Invalid enum, should be 'memorized'
        });
        const err = invalid.validateSync();
        expect(err.errors.status).toBeDefined();
    });

    test('has compound indexes configured on schema', () => {
        const indexes = FormulaProgress.schema.indexes();

        const hasUserCardIndex = indexes.some(idx => idx[0].userId === 1 && idx[0].cardId === 1);
        const hasChapterStatusIndex = indexes.some(idx => idx[0].userId === 1 && idx[0].chapterTitle === 1 && idx[0].status === 1);
        const hasNextReviewIndex = indexes.some(idx => idx[0].userId === 1 && idx[0].nextReviewDate === 1);

        expect(hasUserCardIndex).toBe(true);
        expect(hasChapterStatusIndex).toBe(true);
        expect(hasNextReviewIndex).toBe(true);
    });
});
