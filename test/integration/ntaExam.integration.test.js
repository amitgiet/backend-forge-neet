const mongoose = require('mongoose');

jest.mock('../../src/models/TestAttempt');
jest.mock('../../src/models/MockTest');
jest.mock('../../src/models/User');
jest.mock('../../src/services/exam/scoringService');
jest.mock('../../src/services/redisService', () => ({
  hset: jest.fn().mockResolvedValue(1),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  deleteExamKeys: jest.fn().mockResolvedValue(true)
}));

const TestAttempt = require('../../src/models/TestAttempt');
const MockTest = require('../../src/models/MockTest');
const User = require('../../src/models/User');
const scoringService = require('../../src/services/exam/scoringService');
const redisService = require('../../src/services/redisService');
const mockController = require('../../src/controllers/mockController');
const testController = require('../../src/controllers/testController');

describe('NTA Exam Integration Tests (Story 2)', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      params: {},
      body: {},
      headers: {},
      user: { id: new mongoose.Types.ObjectId().toString(), subscription: { plan: 'pro' } }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('POST /api/v1/mocks/attempt/:attemptId/submit (submitMockTest)', () => {
    it('returns HTTP 400 for invalid attempt ID', async () => {
      req.params.attemptId = 'invalid-object-id';
      await mockController.submitMockTest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Invalid attempt ID' })
      );
    });

    it('returns HTTP 404 if attempt is not found', async () => {
      req.params.attemptId = new mongoose.Types.ObjectId().toString();
      TestAttempt.findById.mockResolvedValue(null);

      await mockController.submitMockTest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Attempt not found' })
      );
    });

    it('handles already submitted attempts idempotently with HTTP 200', async () => {
      const validId = new mongoose.Types.ObjectId().toString();
      req.params.attemptId = validId;
      TestAttempt.findById.mockResolvedValue({
        _id: validId,
        status: 'SUBMITTED',
        results: { marksObtained: 650, maxMarks: 720 }
      });

      await mockController.submitMockTest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Already submitted' })
      );
    });

    it('successfully grades attempt without 500 error, updates user analytics atomically, and deletes redis keys', async () => {
      const validId = new mongoose.Types.ObjectId().toString();
      req.params.attemptId = validId;
      req.body = {
        answers: [{ questionId: 'q1', selectedOption: 'A' }]
      };

      const mockAttemptDoc = {
        _id: validId,
        status: 'IN_PROGRESS',
        answers: [],
        serverTimestamps: {},
        save: jest.fn().mockResolvedValue(true)
      };

      TestAttempt.findById.mockResolvedValue(mockAttemptDoc);
      scoringService.calculateScore.mockResolvedValue({
        marksObtained: 680,
        maxMarks: 720,
        accuracy: 95,
        totalAttempted: 175,
        totalCorrect: 170
      });
      User.findByIdAndUpdate.mockResolvedValue({});

      await mockController.submitMockTest(req, res, next);

      expect(scoringService.calculateScore).toHaveBeenCalledWith(mockAttemptDoc);
      expect(mockAttemptDoc.save).toHaveBeenCalled();
      expect(mockAttemptDoc.status).toBe('SUBMITTED');
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        req.user.id,
        expect.objectContaining({
          $inc: expect.objectContaining({
            'analytics.totalMocksAttempted': 1,
            'gamification.totalXP': 300
          })
        })
      );
      expect(redisService.deleteExamKeys).toHaveBeenCalledWith(validId);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, results: expect.any(Object) })
      );
    });
  });

  describe('POST /api/v1/tests/attempts/:id/sync-batch (syncBatchAnswers)', () => {
    it('returns HTTP 400 if batch is missing or empty', async () => {
      req.params.attemptId = new mongoose.Types.ObjectId().toString();
      req.body = { batch: [] };

      await testController.syncBatchAnswers(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Batch array required' })
      );
    });

    it('performs atomic bulkWrite and updates Redis lastSyncedAt', async () => {
      const attemptId = new mongoose.Types.ObjectId().toString();
      req.params.attemptId = attemptId;
      req.body = {
        batch: [
          { questionId: 'q1', selectedOption: 'B', isMarkedForReview: false, timeSpentSeconds: 15 },
          { questionId: 'q2', selectedOption: 'C', isMarkedForReview: true, timeSpentSeconds: 25 }
        ]
      };

      TestAttempt.bulkWrite = jest.fn().mockResolvedValue({ ok: 1, modifiedCount: 2 });

      await testController.syncBatchAnswers(req, res, next);

      expect(TestAttempt.bulkWrite).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            updateOne: expect.objectContaining({
              filter: expect.objectContaining({ _id: attemptId }),
              update: expect.any(Object)
            })
          })
        ]),
        { ordered: false }
      );
      expect(redisService.hset).toHaveBeenCalledWith(
        `exam:active:${attemptId}`,
        'lastSyncedAt',
        expect.any(String)
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, syncedCount: 2 });
    });
  });
});
