const sm2Service = require('../../src/services/sm2Service');

describe('SuperMemo-2 (SM-2) Calculation Service', () => {
    test('quality 1 (Again) resets repetitions to 0, interval to 1 day, and status to need_revision', () => {
        const current = {
            easeFactor: 2.5,
            intervalDays: 10,
            repetitions: 3
        };

        const result = sm2Service.calculateNextReview(current, 1);

        expect(result.repetitions).toBe(0);
        expect(result.intervalDays).toBe(1);
        expect(result.status).toBe('need_revision');
        expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
    });

    test('repetition 0 with quality 4 (Good) sets interval to 1 day and repetitions to 1', () => {
        const current = {
            easeFactor: 2.5,
            intervalDays: 0,
            repetitions: 0
        };

        const result = sm2Service.calculateNextReview(current, 4);

        expect(result.repetitions).toBe(1);
        expect(result.intervalDays).toBe(1);
        expect(result.status).toBe('learning');
    });

    test('repetition 0 with quality 5 (Easy) sets interval to 2 days', () => {
        const current = {
            easeFactor: 2.5,
            intervalDays: 0,
            repetitions: 0
        };

        const result = sm2Service.calculateNextReview(current, 5);

        expect(result.repetitions).toBe(1);
        expect(result.intervalDays).toBe(2);
        expect(result.status).toBe('learning');
    });

    test('repetition 1 sets interval to 6 days and repetitions to 2', () => {
        const current = {
            easeFactor: 2.5,
            intervalDays: 1,
            repetitions: 1
        };

        const result = sm2Service.calculateNextReview(current, 4);

        expect(result.repetitions).toBe(2);
        expect(result.intervalDays).toBe(6);
        expect(result.status).toBe('learning');
    });

    test('interval progression >= 21 days transitions card status to memorized', () => {
        const current = {
            easeFactor: 2.6,
            intervalDays: 15,
            repetitions: 3
        };

        const result = sm2Service.calculateNextReview(current, 4);

        expect(result.intervalDays).toBeGreaterThanOrEqual(21);
        expect(result.status).toBe('memorized');
    });

    test('clamps ease factor at minimum 1.3 even after repeated difficult ratings', () => {
        let current = {
            easeFactor: 1.35,
            intervalDays: 1,
            repetitions: 1
        };

        // Repeated quality 1 ratings
        for (let i = 0; i < 5; i++) {
            current = sm2Service.calculateNextReview(current, 1);
        }

        expect(current.easeFactor).toBe(1.3);
    });

    test('nextReviewDate is correctly calculated from intervalDays', () => {
        const before = new Date();
        const result = sm2Service.calculateNextReview({ easeFactor: 2.5, intervalDays: 0, repetitions: 0 }, 4);
        const after = new Date();

        const expectedDateMin = new Date(before);
        expectedDateMin.setDate(expectedDateMin.getDate() + 1);

        const expectedDateMax = new Date(after);
        expectedDateMax.setDate(expectedDateMax.getDate() + 1);

        expect(result.nextReviewDate.getDate()).toBe(expectedDateMin.getDate());
    });
});
