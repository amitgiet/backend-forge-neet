const DataSummaryService = require('../src/services/dataSummaryService');
const AITools = require('../src/services/aiTools');

jest.mock('../src/services/aiTools');

describe('DataSummaryService', () => {
  beforeEach(() => jest.resetAllMocks());

  test('returns insufficient when no data', async () => {
    AITools.getOverallAccuracy.mockResolvedValue(null);
    AITools.getLastQuiz.mockResolvedValue([]);
    AITools.getWeakTopics.mockResolvedValue([]);
    AITools.getRevisionDue.mockResolvedValue({ total: 0 });
    AITools.getStudyInsights.mockResolvedValue(null);
    AITools.getAccuracyTrend.mockResolvedValue([]);

    const res = await DataSummaryService.generateMasterSummary('user1');
    expect(res.isSufficient).toBe(false);
    expect(res.summaryText).toBe('No data available');
  });

  test('detects trend and is sufficient when quizzes exist', async () => {
    AITools.getOverallAccuracy.mockResolvedValue({ accuracy: 72 });
    AITools.getLastQuiz.mockResolvedValue([{ topic: 'T1', date: new Date(), accuracy: 70 }]);
    AITools.getWeakTopics.mockResolvedValue([{ topic: 'X' }]);
    AITools.getRevisionDue.mockResolvedValue({ total: 0 });
    AITools.getStudyInsights.mockResolvedValue({ completed: 2, goal: 10 });
    AITools.getAccuracyTrend.mockResolvedValue([
      { date: '2026-02-10', accuracy: 68 },
      { date: '2026-02-24', accuracy: 72 }
    ]);

    const res = await DataSummaryService.generateMasterSummary('user2');
    expect(res.isSufficient).toBe(true);
    expect(res.trend.status).toBe('improving');
    expect(res.quizzesCount).toBeGreaterThan(0);
  });
});
