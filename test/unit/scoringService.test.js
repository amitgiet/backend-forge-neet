const scoringService = require('../../src/services/exam/scoringService');

describe('ScoringService - NTA NEET UG Calculation Engine', () => {
  it('correctly scores Section A questions with +4 for correct, -1 for incorrect, and 0 for unattempted', async () => {
    const questions = [
      { _id: 'q1', correctOption: 'A', subject: 'physics' },
      { _id: 'q2', correctOption: 'B', subject: 'physics' },
      { _id: 'q3', correctOption: 'C', subject: 'physics' }
    ];

    const attempt = {
      answers: [
        { questionId: 'q1', sectionKey: 'PHY_A', selectedOption: 'A' }, // +4
        { questionId: 'q2', sectionKey: 'PHY_A', selectedOption: 'D' }, // -1
        { questionId: 'q3', sectionKey: 'PHY_A', selectedOption: null } // 0
      ]
    };

    const result = await scoringService.calculateScore(attempt, questions);

    expect(result.marksObtained).toBe(3);
    expect(result.rawMarks).toBe(3);
    expect(result.totalAttempted).toBe(2);
    expect(result.totalCorrect).toBe(1);
    expect(result.totalIncorrect).toBe(1);
    expect(result.totalUnattempted).toBe(1);
    expect(result.accuracy).toBe(50);
    expect(result.subjectBreakdown.physics.marks).toBe(3);
  });

  it('strictly enforces Section B 10/15 truncation based on attemptedAt timestamps', async () => {
    // 15 Section B questions all answered correctly
    const questions = Array.from({ length: 15 }, (_, i) => ({
      _id: `qb_${i + 1}`,
      correctOption: 'A',
      subject: 'chemistry'
    }));

    // Answers timestamped 1 to 15 minutes apart
    const answers = Array.from({ length: 15 }, (_, i) => ({
      questionId: `qb_${i + 1}`,
      sectionKey: 'CHEM_B',
      selectedOption: 'A',
      attemptedAt: new Date(1700000000000 + i * 60000)
    }));

    const attempt = { answers };
    const result = await scoringService.calculateScore(attempt, questions);

    // Only the first 10 should receive +4 = 40 marks; questions 11-15 should be ignored (0 marks)
    expect(result.marksObtained).toBe(40);
    expect(result.subjectBreakdown.chemistry.marks).toBe(40);
    expect(result.subjectBreakdown.chemistry.correct).toBe(10);
    expect(result.totalCorrect).toBe(10);

    // Check that answers 11-15 are marked with isIgnoredExceedLimit: true
    for (let i = 0; i < 10; i++) {
      expect(attempt.answers[i].marksAwarded).toBe(4);
      expect(attempt.answers[i].isIgnoredExceedLimit).toBe(false);
    }
    for (let i = 10; i < 15; i++) {
      expect(attempt.answers[i].marksAwarded).toBe(0);
      expect(attempt.answers[i].isIgnoredExceedLimit).toBe(true);
    }

    expect(result.sectionBSelections.CHEM_B.evaluated).toHaveLength(10);
    expect(result.sectionBSelections.CHEM_B.ignored).toHaveLength(5);
  });

  it('caps max score at 720 for a full perfect test and clamps non-negative marks', async () => {
    const perfectAttempt = {
      answers: []
    };

    const perfectQuestions = [];
    const sections = ['PHY_A', 'PHY_B', 'CHEM_A', 'CHEM_B', 'BOT_A', 'BOT_B', 'ZOO_A', 'ZOO_B'];

    sections.forEach((sec) => {
      const isSecB = sec.endsWith('_B');
      const count = isSecB ? 15 : 35;
      for (let i = 0; i < count; i++) {
        const id = `${sec}_${i + 1}`;
        perfectQuestions.push({ _id: id, correctOption: 'A' });
        perfectAttempt.answers.push({
          questionId: id,
          sectionKey: sec,
          selectedOption: 'A',
          attemptedAt: new Date(1700000000000 + i * 1000)
        });
      }
    });

    const perfectResult = await scoringService.calculateScore(perfectAttempt, perfectQuestions);
    // 35*4 + 10*4 = 180 questions scored * 4 = 720 marks
    expect(perfectResult.marksObtained).toBe(720);
    expect(perfectResult.rank).toBe(1);
    expect(perfectResult.accuracy).toBe(100);

    // Negative raw score should clamp marksObtained to 0
    const allWrongAttempt = {
      answers: [
        { questionId: 'qw1', sectionKey: 'PHY_A', selectedOption: 'D' },
        { questionId: 'qw2', sectionKey: 'PHY_A', selectedOption: 'D' }
      ]
    };
    const wrongQuestions = [
      { _id: 'qw1', correctOption: 'A' },
      { _id: 'qw2', correctOption: 'A' }
    ];
    const wrongResult = await scoringService.calculateScore(allWrongAttempt, wrongQuestions);
    expect(wrongResult.rawMarks).toBe(-2);
    expect(wrongResult.marksObtained).toBe(0);
  });

  it('predicts realistic NEET AIR rank and percentile', () => {
    expect(scoringService.predictRank(720)).toBe(1);
    expect(scoringService.predictRank(700)).toBeLessThanOrEqual(200);
    expect(scoringService.predictRank(650)).toBeLessThanOrEqual(6000);
    expect(scoringService.predictRank(500)).toBeGreaterThan(50000);
    expect(scoringService.predictRank(0)).toBe(2000000);

    expect(scoringService.calculatePercentile(1)).toBe(99.999);
    expect(scoringService.calculatePercentile(24000)).toBeGreaterThan(98);
  });
});
