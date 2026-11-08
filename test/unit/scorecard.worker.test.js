const fs = require('fs');

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    unlink: jest.fn()
  },
  existsSync: jest.fn()
}));

jest.mock('../../src/models/ChapterMastery');
jest.mock('../../src/models/ScorecardAttempt');
jest.mock('../../src/models/User');
jest.mock('../../src/config/redis', () => ({}));
jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((name, processor, opts) => ({
    name,
    processor,
    opts,
    close: jest.fn()
  })),
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    getJob: jest.fn()
  }))
}));

const mockGenerateContent = jest.fn();
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent
    })
  })),
  SchemaType: {
    STRING: 'string',
    NUMBER: 'number',
    INTEGER: 'integer',
    BOOLEAN: 'boolean',
    ARRAY: 'array',
    OBJECT: 'object'
  }
}));

const ChapterMastery = require('../../src/models/ChapterMastery');
const ScorecardAttempt = require('../../src/models/ScorecardAttempt');
const User = require('../../src/models/User');
const { processScorecardJob } = require('../../src/workers/scorecard.worker');

describe('Scorecard Worker - Unit Tests', () => {
  const dummyFilePath = '/tmp/scorecard-test-123.pdf';

  beforeEach(() => {
    jest.clearAllMocks();
    fs.promises.readFile.mockResolvedValue(Buffer.from('fake-pdf-content'));
    fs.promises.unlink.mockResolvedValue(undefined);
    fs.existsSync.mockReturnValue(true);
    ChapterMastery.bulkWrite = jest.fn().mockResolvedValue({ ok: 1 });
    ScorecardAttempt.create = jest.fn().mockResolvedValue({ _id: 'sc1' });
    ScorecardAttempt.findByIdAndUpdate = jest.fn().mockResolvedValue({ _id: 'sc1' });
  });

  it('updates ChapterMastery and User progress using EMA formula: (testAcc * 0.3) + (old * 0.7)', async () => {
    const mockOcrResult = {
      institute: 'Allen Career Institute',
      testName: 'Major Test 01',
      totalMarks: 720,
      scoreObtained: 600,
      accuracyPercentage: 85,
      sillyMistakesCount: 2,
      correctCount: 155,
      incorrectCount: 20,
      totalAttempted: 175,
      unattemptedCount: 5,
      subjects: [
        {
          name: 'Physics',
          score: 150,
          chapters: [
            {
              chapterName: 'Rotational Motion',
              attempted: 10,
              correct: 8, // 80% accuracy
              incorrect: 2,
              sillyMistakes: 1
            }
          ]
        }
      ]
    };

    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify(mockOcrResult)
      }
    });

    const mockUser = {
      _id: 'user123',
      progress: [
        {
          chapterId: 'Rotational Motion',
          subject: 'physics',
          mastery: 50, // Old EMA
          accuracy: 50,
          totalAttempted: 20,
          correctAnswers: 10
        }
      ],
      save: jest.fn().mockResolvedValue(true)
    };
    User.findById = jest.fn().mockResolvedValue(mockUser);

    const mockJob = {
      data: {
        filePath: dummyFilePath,
        mimeType: 'application/pdf',
        userId: 'user123'
      },
      updateProgress: jest.fn().mockResolvedValue(true)
    };

    const result = await processScorecardJob(mockJob);

    expect(result.success).toBe(true);
    expect(result.extracted.institute).toBe('Allen Career Institute');

    // Verify ChapterMastery bulkWrite was called with EMA pipeline logic
    expect(ChapterMastery.bulkWrite).toHaveBeenCalledTimes(1);
    const bulkOps = ChapterMastery.bulkWrite.mock.calls[0][0];
    expect(bulkOps[0].updateOne.filter).toEqual({ userId: 'user123', chapterName: 'Rotational Motion' });

    // Verify User progress updated with EMA formula: (80 * 0.3) + (50 * 0.7) = 24 + 35 = 59
    const expectedEMA = (80 * 0.3) + (50 * 0.7);
    expect(mockUser.progress[0].mastery).toBeCloseTo(expectedEMA, 2);
    expect(mockUser.save).toHaveBeenCalledTimes(1);

    // Verify disk cleanup in finally
    expect(fs.promises.unlink).toHaveBeenCalledWith(dummyFilePath);
  });

  it('calculates true NEET negative marking penalty: +4 correct, -1 incorrect, 0 unattempted', async () => {
    const mockOcrResult = {
      institute: 'Aakash Institute',
      testName: 'AIATS 03',
      totalMarks: 720,
      scoreObtained: 580,
      accuracyPercentage: 80,
      sillyMistakesCount: 3,
      correctCount: 150,
      incorrectCount: 20,
      totalAttempted: 170,
      unattemptedCount: 10,
      subjects: []
    };

    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify(mockOcrResult)
      }
    });

    User.findById = jest.fn().mockResolvedValue(null);

    const mockJob = {
      data: {
        filePath: dummyFilePath,
        mimeType: 'application/pdf',
        userId: 'user123'
      },
      updateProgress: jest.fn().mockResolvedValue(true)
    };

    const result = await processScorecardJob(mockJob);

    expect(result.scoring.correctCount).toBe(150);
    expect(result.scoring.incorrectCount).toBe(20);
    expect(result.scoring.unattemptedCount).toBe(10);
    expect(result.scoring.negativeMarksLost).toBe(20); // 20 * 1
  });

  it('guarantees fs.promises.unlink is called in finally block even when Gemini OCR throws an error', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('Gemini API quota exceeded'));

    const mockJob = {
      data: {
        filePath: dummyFilePath,
        mimeType: 'application/pdf',
        userId: 'user123',
        scorecardAttemptId: 'attempt456'
      },
      updateProgress: jest.fn().mockResolvedValue(true)
    };

    await expect(processScorecardJob(mockJob)).rejects.toThrow('Gemini API quota exceeded');

    // Assert disk cleanup executed despite error
    expect(fs.promises.unlink).toHaveBeenCalledWith(dummyFilePath);
    expect(ScorecardAttempt.findByIdAndUpdate).toHaveBeenCalledWith(
      'attempt456',
      expect.objectContaining({
        processingStatus: 'failed',
        errorMessage: 'Gemini API quota exceeded'
      })
    );
  });
});
