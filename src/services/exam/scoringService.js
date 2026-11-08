const Question = require('../../models/Question');

const SECTION_KEYS = ['PHY_A', 'PHY_B', 'CHEM_A', 'CHEM_B', 'BOT_A', 'BOT_B', 'ZOO_A', 'ZOO_B'];
const SECTION_B_KEYS = ['PHY_B', 'CHEM_B', 'BOT_B', 'ZOO_B'];

const RANK_BRACKETS = [
  { score: 720, rank: 1 },
  { score: 715, rank: 25 },
  { score: 700, rank: 180 },
  { score: 680, rank: 1200 },
  { score: 650, rank: 5500 },
  { score: 600, rank: 22000 },
  { score: 550, rank: 48000 },
  { score: 500, rank: 90000 },
  { score: 450, rank: 150000 },
  { score: 400, rank: 230000 },
  { score: 350, rank: 330000 },
  { score: 300, rank: 470000 },
  { score: 200, rank: 780000 },
  { score: 100, rank: 1250000 },
  { score: 0, rank: 2000000 }
];

function predictRank(marks) {
  if (marks >= 720) return 1;
  if (marks <= 0) return 2000000;

  for (let i = 0; i < RANK_BRACKETS.length - 1; i++) {
    const high = RANK_BRACKETS[i];
    const low = RANK_BRACKETS[i + 1];
    if (marks <= high.score && marks >= low.score) {
      const ratio = (high.score - marks) / (high.score - low.score);
      return Math.round(high.rank + ratio * (low.rank - high.rank));
    }
  }
  return 2000000;
}

function calculatePercentile(rank, totalCandidates = 2400000) {
  if (rank <= 1) return 99.999;
  const percentile = ((totalCandidates - rank) / totalCandidates) * 100;
  return Math.max(0, Math.min(99.99, Number(percentile.toFixed(2))));
}

function getSubjectFromSection(sectionKey) {
  if (!sectionKey) return 'physics';
  if (sectionKey.startsWith('PHY')) return 'physics';
  if (sectionKey.startsWith('CHEM')) return 'chemistry';
  if (sectionKey.startsWith('BOT')) return 'botany';
  if (sectionKey.startsWith('ZOO')) return 'zoology';
  return 'physics';
}

function getCorrectOptionFromQuestion(question) {
  if (!question) return null;
  if (question.correctOption) return String(question.correctOption).trim().toUpperCase();
  if (question.correctAnswer) return String(question.correctAnswer).trim().toUpperCase();
  if (Array.isArray(question.options)) {
    const correctOpt = question.options.find(opt => opt && opt.isCorrect);
    if (correctOpt && correctOpt.key) return String(correctOpt.key).trim().toUpperCase();
  }
  return null;
}

function getAnswerSelectedOption(ans) {
  if (!ans) return null;
  if (typeof ans.selectedOption === 'string' && ans.selectedOption.trim()) {
    return ans.selectedOption.trim().toUpperCase();
  }
  if (ans.answerPayload) {
    if (typeof ans.answerPayload.selectedOption === 'string' && ans.answerPayload.selectedOption.trim()) {
      return ans.answerPayload.selectedOption.trim().toUpperCase();
    }
    if (typeof ans.answerPayload === 'string' && ans.answerPayload.trim()) {
      return ans.answerPayload.trim().toUpperCase();
    }
  }
  return null;
}

function inferSectionKey(ans, index) {
  if (ans.sectionKey && SECTION_KEYS.includes(ans.sectionKey)) {
    return ans.sectionKey;
  }
  if (index < 35) return 'PHY_A';
  if (index < 50) return 'PHY_B';
  if (index < 85) return 'CHEM_A';
  if (index < 100) return 'CHEM_B';
  if (index < 135) return 'BOT_A';
  if (index < 150) return 'BOT_B';
  if (index < 185) return 'ZOO_A';
  return 'ZOO_B';
}

class ScoringService {
  predictRank(marks) {
    return predictRank(marks);
  }

  calculatePercentile(rank) {
    return calculatePercentile(rank);
  }

  /**
   * Pure calculation engine evaluating NEET scoring:
   * +4 for correct, -1 for incorrect, 0 for unattempted
   * Strict Section B 10/15 truncation: only earliest 10 attempted questions are scored
   * Max 720 marks, per-subject breakdown, rank & percentile prediction.
   */
  async calculateScore(attempt, providedQuestions = null) {
    if (!attempt || !Array.isArray(attempt.answers)) {
      return {
        marksObtained: 0,
        rawMarks: 0,
        maxMarks: 720,
        accuracy: 0,
        percentile: 0,
        rank: 2000000,
        predictedRank: 2000000,
        subjectBreakdown: {
          physics: { marks: 0, correct: 0, incorrect: 0, unattempted: 0, accuracy: 0 },
          chemistry: { marks: 0, correct: 0, incorrect: 0, unattempted: 0, accuracy: 0 },
          botany: { marks: 0, correct: 0, incorrect: 0, unattempted: 0, accuracy: 0 },
          zoology: { marks: 0, correct: 0, incorrect: 0, unattempted: 0, accuracy: 0 }
        }
      };
    }

    let questions = providedQuestions;
    if (!questions) {
      const questionIds = attempt.answers
        .map(a => a.questionId?._id || a.questionId)
        .filter(Boolean);

      if (questionIds.length > 0) {
        questions = await Question.find({ _id: { $in: questionIds } })
          .select('_id questionId correctAnswer correctOption options subject chapterId topicId')
          .lean();
      } else {
        questions = [];
      }
    }

    const questionMap = new Map();
    questions.forEach(q => {
      if (q._id) questionMap.set(q._id.toString(), q);
      if (q.questionId) questionMap.set(String(q.questionId), q);
    });

    const sections = {
      PHY_A: [], PHY_B: [],
      CHEM_A: [], CHEM_B: [],
      BOT_A: [], BOT_B: [],
      ZOO_A: [], ZOO_B: []
    };

    attempt.answers.forEach((ans, idx) => {
      const secKey = inferSectionKey(ans, idx);
      ans.sectionKey = secKey;
      ans.orderIndex = idx;
      if (sections[secKey]) {
        sections[secKey].push(ans);
      }
    });

    let totalMarks = 0;
    let totalCorrect = 0;
    let totalIncorrect = 0;
    let totalAttempted = 0;
    let totalUnattempted = 0;

    const subjectStats = {
      physics: { marks: 0, correct: 0, incorrect: 0, unattempted: 0, accuracy: 0 },
      chemistry: { marks: 0, correct: 0, incorrect: 0, unattempted: 0, accuracy: 0 },
      botany: { marks: 0, correct: 0, incorrect: 0, unattempted: 0, accuracy: 0 },
      zoology: { marks: 0, correct: 0, incorrect: 0, unattempted: 0, accuracy: 0 }
    };

    const sectionBreakdown = {};
    SECTION_KEYS.forEach(k => {
      sectionBreakdown[k] = { marks: 0, correct: 0, incorrect: 0, unattempted: 0, total: sections[k].length };
    });

    const sectionBSelections = {
      PHY_B: { evaluated: [], ignored: [] },
      CHEM_B: { evaluated: [], ignored: [] },
      BOT_B: { evaluated: [], ignored: [] },
      ZOO_B: { evaluated: [], ignored: [] }
    };

    // 1. Process Section A (35 questions each: all attempted are scored)
    ['PHY_A', 'CHEM_A', 'BOT_A', 'ZOO_A'].forEach(secKey => {
      const subj = getSubjectFromSection(secKey);
      sections[secKey].forEach(ans => {
        const qId = ans.questionId?._id?.toString() || ans.questionId?.toString();
        const q = questionMap.get(qId);
        const correctOpt = getCorrectOptionFromQuestion(q);
        const selected = getAnswerSelectedOption(ans);

        ans.isIgnoredExceedLimit = false;

        if (!selected) {
          ans.marksAwarded = 0;
          ans.isCorrect = false;
          subjectStats[subj].unattempted += 1;
          sectionBreakdown[secKey].unattempted += 1;
          totalUnattempted += 1;
          return;
        }

        totalAttempted += 1;
        const isCorrect = correctOpt !== null && selected === correctOpt;
        ans.isCorrect = isCorrect;

        if (isCorrect) {
          ans.marksAwarded = 4;
          totalMarks += 4;
          totalCorrect += 1;
          subjectStats[subj].marks += 4;
          subjectStats[subj].correct += 1;
          sectionBreakdown[secKey].marks += 4;
          sectionBreakdown[secKey].correct += 1;
        } else {
          ans.marksAwarded = -1;
          totalMarks -= 1;
          totalIncorrect += 1;
          subjectStats[subj].marks -= 1;
          subjectStats[subj].incorrect += 1;
          sectionBreakdown[secKey].marks -= 1;
          sectionBreakdown[secKey].incorrect += 1;
        }
      });
    });

    // 2. Process Section B (Strict NTA 10/15 Truncation Rule)
    SECTION_B_KEYS.forEach(secKey => {
      const subj = getSubjectFromSection(secKey);
      const attemptedAnswers = sections[secKey].filter(ans => !!getAnswerSelectedOption(ans));

      // Sort by attemptedAt ascending (Authoritative first 10 rule)
      attemptedAnswers.sort((a, b) => {
        const timeA = a.attemptedAt ? new Date(a.attemptedAt).getTime() : 0;
        const timeB = b.attemptedAt ? new Date(b.attemptedAt).getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        return (a.orderIndex || 0) - (b.orderIndex || 0);
      });

      const eligible10 = attemptedAnswers.slice(0, 10);
      const eligibleSet = new Set(eligible10.map(a => (a.questionId?._id?.toString() || a.questionId?.toString())));

      eligible10.forEach(a => {
        const qId = a.questionId?._id?.toString() || a.questionId?.toString();
        sectionBSelections[secKey].evaluated.push(qId);
      });

      sections[secKey].forEach(ans => {
        const qId = ans.questionId?._id?.toString() || ans.questionId?.toString();
        const q = questionMap.get(qId);
        const correctOpt = getCorrectOptionFromQuestion(q);
        const selected = getAnswerSelectedOption(ans);

        if (!selected) {
          ans.marksAwarded = 0;
          ans.isCorrect = false;
          ans.isIgnoredExceedLimit = false;
          subjectStats[subj].unattempted += 1;
          sectionBreakdown[secKey].unattempted += 1;
          totalUnattempted += 1;
          return;
        }

        if (!eligibleSet.has(qId)) {
          // Exceeded 10 question limit: ignored (0 marks)
          ans.marksAwarded = 0;
          ans.isCorrect = false;
          ans.isIgnoredExceedLimit = true;
          sectionBSelections[secKey].ignored.push(qId);
          return;
        }

        ans.isIgnoredExceedLimit = false;
        totalAttempted += 1;
        const isCorrect = correctOpt !== null && selected === correctOpt;
        ans.isCorrect = isCorrect;

        if (isCorrect) {
          ans.marksAwarded = 4;
          totalMarks += 4;
          totalCorrect += 1;
          subjectStats[subj].marks += 4;
          subjectStats[subj].correct += 1;
          sectionBreakdown[secKey].marks += 4;
          sectionBreakdown[secKey].correct += 1;
        } else {
          ans.marksAwarded = -1;
          totalMarks -= 1;
          totalIncorrect += 1;
          subjectStats[subj].marks -= 1;
          subjectStats[subj].incorrect += 1;
          sectionBreakdown[secKey].marks -= 1;
          sectionBreakdown[secKey].incorrect += 1;
        }
      });
    });

    // Calculate subject accuracies
    Object.keys(subjectStats).forEach(s => {
      const item = subjectStats[s];
      const attempted = item.correct + item.incorrect;
      item.accuracy = attempted > 0 ? Math.round((item.correct / attempted) * 100) : 0;
    });

    const marksObtained = Math.max(0, totalMarks);
    const overallAccuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;
    const predictedRank = predictRank(marksObtained);
    const percentile = calculatePercentile(predictedRank);

    const breakdown = {
      marksObtained,
      rawMarks: totalMarks,
      maxMarks: 720,
      totalAttempted,
      totalCorrect,
      totalIncorrect,
      totalUnattempted,
      accuracy: overallAccuracy,
      percentile,
      rank: predictedRank,
      predictedRank,
      subjectBreakdown: subjectStats,
      sectionBreakdown,
      sectionBSelections
    };

    attempt.scoringBreakdown = breakdown;
    attempt.sectionBSelections = sectionBSelections;
    attempt.results = {
      ...(attempt.results || {}),
      marksObtained,
      totalMarks: 720,
      maxMarks: 720,
      accuracy: overallAccuracy,
      percentile,
      rank: predictedRank,
      predictedRank,
      correct: totalCorrect,
      incorrect: totalIncorrect,
      attempted: totalAttempted,
      skipped: totalUnattempted,
      subjectBreakdown: subjectStats
    };

    attempt.score = {
      totalQuestions: 200,
      totalMarks: 720,
      attempted: totalAttempted,
      correct: totalCorrect,
      incorrect: totalIncorrect,
      marksObtained,
      percentage: Math.round((marksObtained / 720) * 100)
    };

    return breakdown;
  }

  // Alias matching backend.md
  async calculateAttemptScore(attempt, questions = null) {
    return this.calculateScore(attempt, questions);
  }
}

module.exports = new ScoringService();
