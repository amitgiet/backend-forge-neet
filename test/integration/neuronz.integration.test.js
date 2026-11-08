jest.mock('../../src/models/UserQuestion');
jest.mock('../../src/models/ImportedQuestion');
jest.mock('../../src/models/User');
jest.mock('../../src/models/NotificationLog');
jest.mock('../../src/models/DailyChallenge');
jest.mock('../../services/notificationService');

const UserQuestion = require('../../src/models/UserQuestion');
const User = require('../../src/models/User');
const NotificationLog = require('../../src/models/NotificationLog');
const NotificationService = require('../../services/notificationService');
const NeuronzService = require('../../src/services/neuronzService');
const neuronzController = require('../../src/controllers/neuronzController');
const CronService = require('../../src/services/cronService');

describe('NeuronZ FSRS Spaced Repetition Engine & Batch Integration', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
        req = {
            user: { _id: 'u123', id: 'u123' },
            body: {},
            params: {},
            query: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        next = jest.fn();
        jest.clearAllMocks();
    });

    describe('reviewBatch Atomic Execution (< 120ms)', () => {
        test('processes 20 items in a single bulkWrite with < 120ms execution time', async () => {
            const reviews = Array.from({ length: 20 }, (_, i) => ({
                questionId: `q_${i}`,
                wasCorrect: i % 2 === 0,
                timeSpentSeconds: 12
            }));
            req.body = { reviews };

            // Mock existing docs
            const mockExisting = reviews.map((r, i) => ({
                questionId: r.questionId,
                level: (i % 6) + 1,
                streak: 2,
                lapses: 0
            }));

            UserQuestion.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue(mockExisting)
            });
            UserQuestion.bulkWrite.mockResolvedValue({ ok: 1, modifiedCount: 20 });
            User.findById.mockResolvedValue(null);

            const startTime = Date.now();
            await neuronzController.reviewBatch(req, res, next);
            const duration = Date.now() - startTime;

            expect(UserQuestion.find).toHaveBeenCalledTimes(1);
            expect(UserQuestion.bulkWrite).toHaveBeenCalledTimes(1);
            expect(duration).toBeLessThan(120);

            const bulkOps = UserQuestion.bulkWrite.mock.calls[0][0];
            expect(bulkOps).toHaveLength(20);

            // Check correct item updates: i=0 is correct, level was 1 -> newLevel 2, streak 3
            const correctOp = bulkOps[0].updateOne;
            expect(correctOp.update.$set.level).toBe(2);
            expect(correctOp.update.$set.streak).toBe(3);
            expect(correctOp.update.$set.lapses).toBe(0);
            expect(correctOp.update.$inc.correctAttempts).toBe(1);

            // Check incorrect item updates: i=1 is incorrect, level was 2 -> newLevel 1, lapses 1, streak 0
            const incorrectOp = bulkOps[1].updateOne;
            expect(incorrectOp.update.$set.level).toBe(1);
            expect(incorrectOp.update.$set.streak).toBe(0);
            expect(incorrectOp.update.$set.lapses).toBe(1);
            expect(incorrectOp.update.$inc.correctAttempts).toBe(0);

            // 4-hour re-test verification for incorrect item
            const scheduledRevision = new Date(incorrectOp.update.$set.nextRevision).getTime();
            const fourHoursFromNow = Date.now() + 4 * 3600000;
            expect(scheduledRevision).toBeGreaterThanOrEqual(fourHoursFromNow - 2000);
            expect(scheduledRevision).toBeLessThanOrEqual(fourHoursFromNow + 2000);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                processedCount: 20
            }));
        });

        test('accepts answers array as fallback payload', async () => {
            req.body = {
                answers: [
                    { questionId: 'q_fallback_1', wasCorrect: true, timeSpent: 5 }
                ]
            };

            UserQuestion.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });
            UserQuestion.bulkWrite.mockResolvedValue({ ok: 1 });
            User.findById.mockResolvedValue(null);

            await neuronzController.reviewBatch(req, res, next);

            expect(UserQuestion.bulkWrite).toHaveBeenCalledTimes(1);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('returns 400 error when reviews array is empty or missing', async () => {
            req.body = { reviews: [] };
            await neuronzController.reviewBatch(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
        });
    });

    describe('assembleDaily20Blitz Deck Composition', () => {
        test('assembles 10 urgent decaying + 6 reinforcement + 4 mastered items', async () => {
            const urgentMocks = Array.from({ length: 10 }, (_, i) => ({
                _id: `u_${i}`,
                questionId: `q_urgent_${i}`,
                level: 2,
                nextRevision: new Date(Date.now() - 3600000)
            }));
            const reinforceMocks = Array.from({ length: 6 }, (_, i) => ({
                _id: `r_${i}`,
                questionId: `q_reinforce_${i}`,
                level: 3,
                nextRevision: new Date(Date.now() + 24 * 3600000)
            }));
            const masteredMocks = Array.from({ length: 4 }, (_, i) => ({
                _id: `m_${i}`,
                questionId: `q_mastered_${i}`,
                level: 7,
                isMastered: true
            }));

            // Mock find chain
            UserQuestion.find
                .mockReturnValueOnce({
                    sort: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                            populate: jest.fn().mockReturnValue({
                                lean: jest.fn().mockResolvedValue(urgentMocks)
                            })
                        })
                    })
                })
                .mockReturnValueOnce({
                    limit: jest.fn().mockReturnValue({
                        populate: jest.fn().mockReturnValue({
                            lean: jest.fn().mockResolvedValue(reinforceMocks)
                        })
                    })
                })
                .mockReturnValueOnce({
                    sort: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                            populate: jest.fn().mockReturnValue({
                                lean: jest.fn().mockResolvedValue(masteredMocks)
                            })
                        })
                    })
                });

            const blitz = await NeuronzService.assembleDaily20Blitz('u123');

            expect(blitz.totalQuestions).toBe(20);
            expect(blitz.deck).toHaveLength(20);
            expect(blitz.deck.slice(0, 10)).toEqual(urgentMocks);
            expect(blitz.deck.slice(10, 16)).toEqual(reinforceMocks);
            expect(blitz.deck.slice(16, 20)).toEqual(masteredMocks);
        });
    });

    describe('getDashboardStats Structure', () => {
        test('returns levels 1 to 7 with correct labels, due counts, and totalTracked', async () => {
            const docs = [
                { level: 1, nextRevision: new Date(Date.now() - 10000), totalAttempts: 1 },
                { level: 2, nextRevision: new Date(Date.now() + 100000000), totalAttempts: 2 },
                { level: 7, nextRevision: new Date(Date.now() - 5000), isMastered: true, totalAttempts: 7 }
            ];

            UserQuestion.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue(docs)
            });

            const stats = await NeuronzService.getDashboardStats('u123');

            expect(stats.levels).toHaveLength(7);
            expect(stats.totalTracked).toBe(3);
            expect(stats.masteredCount).toBe(1);
            expect(stats.totalDue).toBe(2); // L1 and L7 are due
            expect(stats.levels[0].intervalLabel).toBe('After 24 hrs');
            expect(stats.levels[6].intervalLabel).toBe('After 30 days');
        });
    });

    describe('Morning Push Notification Cron Non-Spam Logic', () => {
        test('skips reminder when user has dueCount === 0', async () => {
            NotificationLog.findOne.mockResolvedValue(null);
            UserQuestion.countDocuments.mockResolvedValue(0);

            const user = { _id: 'u_zero_due' };
            await CronService.sendNeuronZReminder(user, '2026-11-08', 'Asia/Kolkata');

            expect(NotificationService.sendEventNotification).not.toHaveBeenCalled();
            expect(NotificationLog.create).not.toHaveBeenCalled();
        });

        test('sends targeted reminder when user has dueCount > 0', async () => {
            NotificationLog.findOne.mockResolvedValue(null);
            UserQuestion.countDocuments.mockResolvedValue(15);
            NotificationService.sendEventNotification.mockResolvedValue({ success: true });
            NotificationLog.create.mockResolvedValue({});

            const user = { _id: 'u_with_due' };
            await CronService.sendNeuronZReminder(user, '2026-11-08', 'Asia/Kolkata');

            expect(NotificationService.sendEventNotification).toHaveBeenCalledWith(
                'u_with_due',
                'neuronz_review_reminder',
                '🧠 NeuronZ Memory Decay Alert',
                'You have 15 high-yield NEET items due for review today.',
                null,
                { date: '2026-11-08', dueCount: 15 }
            );
            expect(NotificationLog.create).toHaveBeenCalled();
        });

        test('sendMorningDecayAlerts dispatches decay notifications strictly to users with due items', async () => {
            UserQuestion.aggregate.mockResolvedValue([
                { _id: 'u_batch_1', dueCount: 8 },
                { _id: 'u_batch_2', dueCount: 14 }
            ]);
            NotificationService.sendEventNotification.mockResolvedValue({ success: true });

            await CronService.sendMorningDecayAlerts();

            expect(NotificationService.sendEventNotification).toHaveBeenCalledTimes(2);
            expect(NotificationService.sendEventNotification).toHaveBeenCalledWith(
                'u_batch_1',
                'neuronz_review_reminder',
                '🧠 NeuronZ Memory Decay Alert',
                'You have 8 high-yield NEET items due for review today.',
                null,
                { dueCount: 8 }
            );
        });
    });
});
