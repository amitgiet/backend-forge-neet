jest.mock('../../src/models/ScorecardAttempt');
jest.mock('../../src/models/TestAttempt');
jest.mock('../../src/models/Question');
jest.mock('../../src/models/Chapter');
jest.mock('../../src/queues/scorecard.queue', () => ({
  add: jest.fn().mockResolvedValue({ id: 'job-scorecard-999' }),
  getJob: jest.fn()
}));

const scorecardQueue = require('../../src/queues/scorecard.queue');
const ScorecardAttempt = require('../../src/models/ScorecardAttempt');
const TestAttempt = require('../../src/models/TestAttempt');
const Question = require('../../src/models/Question');
const Chapter = require('../../src/models/Chapter');
const weaknessController = require('../../src/controllers/weaknessController');

describe('Scorecard & Weakness Analysis Integration Tests', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      user: { _id: 'user123', id: 'user123', primaryExam: 'NEET_UG' },
      file: {
        path: '/tmp/test-scorecard.pdf',
        mimetype: 'application/pdf',
        originalname: 'scorecard.pdf'
      },
      body: {},
      params: {},
      query: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
  });

  describe('POST /upload handshake', () => {
    it('responds within 300ms with HTTP 202 Accepted, jobId, status, and pollUrl', async () => {
      ScorecardAttempt.create.mockResolvedValueOnce({ _id: 'sc-attempt-1' });

      const startTime = Date.now();
      await weaknessController.uploadAndAnalyze(req, res, next);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(300);
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          jobId: 'job-scorecard-999',
          status: 'processing',
          pollUrl: '/api/v1/analyze/jobs/job-scorecard-999'
        })
      );
      expect(scorecardQueue.add).toHaveBeenCalledWith(
        'scorecard-processing',
        expect.objectContaining({
          filePath: '/tmp/test-scorecard.pdf',
          userId: 'user123'
        }),
        expect.any(Object)
      );
    });

    it('returns HTTP 400 when no file is uploaded', async () => {
      req.file = undefined;
      await weaknessController.uploadAndAnalyze(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Scorecard file required')
        })
      );
    });
  });

  describe('GET /jobs/:jobId polling', () => {
    it('returns BullMQ job progress and status transitions', async () => {
      req.params = { jobId: 'job-scorecard-999' };
      scorecardQueue.getJob.mockResolvedValueOnce({
        id: 'job-scorecard-999',
        getState: jest.fn().mockResolvedValue('completed'),
        progress: 100,
        returnvalue: {
          success: true,
          extracted: { institute: 'Allen', scoreObtained: 650 }
        }
      });

      await weaknessController.getJobStatus(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          jobId: 'job-scorecard-999',
          status: 'completed',
          progress: 100,
          result: expect.objectContaining({
            extracted: expect.objectContaining({ institute: 'Allen' })
          })
        })
      );
    });
  });

  describe('GET /history', () => {
    it('returns user scorecard attempts sorted by recency', async () => {
      const mockHistory = [
        { _id: 'sc1', testTitle: 'Allen Major 01', createdAt: new Date() }
      ];
      ScorecardAttempt.find.mockReturnValueOnce({
        sort: jest.fn().mockResolvedValueOnce(mockHistory)
      });

      await weaknessController.getScorecardHistory(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 1,
        data: mockHistory
      });
    });
  });

  describe('POST /remediation-quiz', () => {
    it('assembles and returns 15 targeted questions across weak chapters', async () => {
      req.body = { weakChapters: ['Rotational Motion', 'Thermodynamics'] };

      Chapter.find.mockReturnValueOnce({
        select: jest.fn().mockResolvedValueOnce([
          { chapterId: 'physics_rotational_motion' },
          { chapterId: 'physics_thermodynamics' }
        ])
      });

      const mockQuestions = Array.from({ length: 15 }, (_, i) => ({
        _id: `q_${i + 1}`,
        questionId: `QID_${i + 1}`,
        question: { en: `Question ${i + 1}` },
        options: [{ key: 'A', text: { en: 'Option A' } }],
        correctAnswer: 'A',
        explanation: { en: 'Explanation' },
        chapterId: 'physics_rotational_motion'
      }));

      Question.aggregate.mockResolvedValueOnce(mockQuestions);

      await weaknessController.generateRemediationQuiz(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          count: 15,
          quizTitle: 'Scorecard Remediation Drill',
          questions: expect.arrayContaining([
            expect.objectContaining({ _id: 'q_1' })
          ])
        })
      );
    });
  });

  describe('GET /trends - P0 regression check', () => {
    it('queries status: "submitted" (never "COMPLETED") and executes without this context crash', async () => {
      req.query = { timeframe: 30 };

      TestAttempt.find.mockReturnValueOnce({
        sort: jest.fn().mockReturnValueOnce({
          select: jest.fn().mockResolvedValueOnce([
            {
              submittedAt: new Date(),
              score: { marksObtained: 550, percentage: 76, correct: 140, attempted: 170 },
              chapterAnalysis: [
                { chapterId: 'rotational_motion', accuracy: 50, subject: 'physics' }
              ]
            }
          ])
        })
      });

      await weaknessController.getWeaknessTrends(req, res, next);

      expect(TestAttempt.find).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          status: 'submitted'
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            scoreProgression: expect.any(Array),
            accuracyProgression: expect.any(Array)
          })
        })
      );
    });
  });
});
