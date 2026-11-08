const mongoose = require('mongoose');
const UserQuestion = require('../../src/models/UserQuestion');

describe('UserQuestion Model & FSRS-Lite Engine', () => {
    describe('Schema Defaults & Indexes', () => {
        test('sets default values for level, streak, lapses, isMastered', () => {
            const uq = new UserQuestion({
                userId: new mongoose.Types.ObjectId(),
                questionId: 'q_test_123'
            });

            expect(uq.level).toBe(1);
            expect(uq.streak).toBe(0);
            expect(uq.lapses).toBe(0);
            expect(uq.isMastered).toBe(false);
            expect(uq.totalAttempts).toBe(0);
            expect(uq.correctAttempts).toBe(0);
            expect(uq.nextRevision).toBeDefined();
        });

        test('has compound indexes configured on schema', () => {
            const indexes = UserQuestion.schema.indexes();
            const hasUserQuestionIdx = indexes.some(idx => idx[0].userId === 1 && idx[0].questionId === 1);
            const hasUserRevisionIdx = indexes.some(idx => idx[0].userId === 1 && idx[0].nextRevision === 1);
            const hasUserLevelIdx = indexes.some(idx => idx[0].userId === 1 && idx[0].level === 1);

            expect(hasUserQuestionIdx).toBe(true);
            expect(hasUserRevisionIdx).toBe(true);
            expect(hasUserLevelIdx).toBe(true);
        });
    });

    describe('updateLevel - Recall Success', () => {
        test('advances level by 1, increments streak and sets correct interval', () => {
            const uq = new UserQuestion({
                userId: new mongoose.Types.ObjectId(),
                questionId: 'q_test_1',
                level: 1,
                streak: 0
            });

            const beforeTime = Date.now();
            uq.updateLevel(true, 15);
            const afterTime = Date.now();

            expect(uq.level).toBe(2);
            expect(uq.streak).toBe(1);
            expect(uq.totalAttempts).toBe(1);
            expect(uq.correctAttempts).toBe(1);
            expect(uq.isMastered).toBe(false);

            // Level 2 interval: 72 hours
            const expectedTime = beforeTime + 72 * 3600000;
            expect(uq.nextRevision.getTime()).toBeGreaterThanOrEqual(expectedTime - 1000);
            expect(uq.nextRevision.getTime()).toBeLessThanOrEqual(afterTime + 72 * 3600000 + 1000);
        });

        test('promotes to Level 7 (Mastered) and caps level at 7 with 720h interval', () => {
            const uq = new UserQuestion({
                userId: new mongoose.Types.ObjectId(),
                questionId: 'q_test_l6',
                level: 6,
                streak: 5
            });

            const beforeTime = Date.now();
            uq.updateLevel(true, 20);

            expect(uq.level).toBe(7);
            expect(uq.streak).toBe(6);
            expect(uq.isMastered).toBe(true);

            // Level 7 interval: 720 hours (30 days)
            const expectedTime = beforeTime + 720 * 3600000;
            expect(uq.nextRevision.getTime()).toBeGreaterThanOrEqual(expectedTime - 1000);

            // Additional correct attempt at level 7 stays at 7
            uq.updateLevel(true, 18);
            expect(uq.level).toBe(7);
            expect(uq.isMastered).toBe(true);
            expect(uq.streak).toBe(7);
        });
    });

    describe('updateLevel - Recall Failure (Anti-SRS Decay Trap Fix)', () => {
        test('drops 2 levels, resets streak, increments lapses, schedules 4-hour re-test', () => {
            const uq = new UserQuestion({
                userId: new mongoose.Types.ObjectId(),
                questionId: 'q_test_fail',
                level: 5,
                streak: 4,
                lapses: 0
            });

            const beforeTime = Date.now();
            uq.updateLevel(false, 30);
            const afterTime = Date.now();

            // Level drops from 5 to 3
            expect(uq.level).toBe(3);
            expect(uq.streak).toBe(0);
            expect(uq.lapses).toBe(1);
            expect(uq.isMastered).toBe(false);
            expect(uq.totalAttempts).toBe(1);
            expect(uq.correctAttempts).toBe(0);

            // Mandatory 4-hour re-test queue
            const expectedTime = beforeTime + 4 * 3600000;
            expect(uq.nextRevision.getTime()).toBeGreaterThanOrEqual(expectedTime - 1000);
            expect(uq.nextRevision.getTime()).toBeLessThanOrEqual(afterTime + 4 * 3600000 + 1000);
        });

        test('floors level at Level 1 on failure when level is 1 or 2', () => {
            const uqL2 = new UserQuestion({
                userId: new mongoose.Types.ObjectId(),
                questionId: 'q_test_l2',
                level: 2,
                streak: 1,
                lapses: 2
            });

            uqL2.updateLevel(false, 10);
            expect(uqL2.level).toBe(1);
            expect(uqL2.lapses).toBe(3);

            const uqL1 = new UserQuestion({
                userId: new mongoose.Types.ObjectId(),
                questionId: 'q_test_l1',
                level: 1,
                streak: 0,
                lapses: 1
            });

            uqL1.updateLevel(false, 10);
            expect(uqL1.level).toBe(1);
            expect(uqL1.lapses).toBe(2);
        });

        test('unmarks isMastered when Level 7 recall fails', () => {
            const uqL7 = new UserQuestion({
                userId: new mongoose.Types.ObjectId(),
                questionId: 'q_test_l7_fail',
                level: 7,
                streak: 8,
                isMastered: true
            });

            uqL7.updateLevel(false, 25);
            expect(uqL7.level).toBe(5); // 7 - 2 = 5
            expect(uqL7.isMastered).toBe(false);
            expect(uqL7.streak).toBe(0);
            expect(uqL7.lapses).toBe(1);
        });
    });

    describe('userHistory management', () => {
        test('slices userHistory to max 7 records', () => {
            const uq = new UserQuestion({
                userId: new mongoose.Types.ObjectId(),
                questionId: 'q_test_history',
                level: 1
            });

            for (let i = 0; i < 10; i++) {
                uq.updateLevel(i % 2 === 0, 10);
            }

            expect(uq.userHistory.length).toBe(7);
            expect(uq.totalAttempts).toBe(10);
        });
    });
});
