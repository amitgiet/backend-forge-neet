const mongoose = require('mongoose');
const TestAttempt = require('../../src/models/TestAttempt');

describe('TestAttempt Model Schema', () => {
  it('instantiates correctly with Section B and wall-clock anchoring fields', () => {
    const userId = new mongoose.Types.ObjectId();
    const testId = new mongoose.Types.ObjectId();
    const questionId = new mongoose.Types.ObjectId();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 200 * 60 * 1000);

    const attempt = new TestAttempt({
      userId,
      testId,
      startedAt: now,
      expiresAt,
      durationMinutes: 200,
      status: 'IN_PROGRESS',
      serverTimestamps: {
        startedAt: now,
        expiresAt,
        submittedAt: null
      },
      answers: [
        {
          questionId,
          sectionKey: 'PHY_B',
          selectedOption: 'B',
          isMarkedForReview: true,
          timeSpentSeconds: 45,
          attemptedAt: now
        }
      ]
    });

    expect(attempt.userId.toString()).toBe(userId.toString());
    expect(attempt.testId.toString()).toBe(testId.toString());
    expect(attempt.durationMinutes).toBe(200);
    expect(attempt.answers[0].sectionKey).toBe('PHY_B');
    expect(attempt.answers[0].selectedOption).toBe('B');
    expect(attempt.answers[0].isMarkedForReview).toBe(true);
    expect(attempt.answers[0].timeSpentSeconds).toBe(45);
    expect(attempt.remainingSeconds).toBeGreaterThan(0);
  });

  it('verifies compound indexes are defined on the schema', () => {
    const indexes = TestAttempt.schema.indexes();
    const indexFields = indexes.map(idx => Object.keys(idx[0]).join(','));

    expect(indexFields).toContain('userId,status');
    expect(indexFields).toContain('status,expiresAt');
    expect(indexFields).toContain('userId,testId,status');
  });
});
