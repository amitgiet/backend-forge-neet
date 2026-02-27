const { GoogleGenerativeAI } = require('@google/generative-ai');
const Chapter = require('../models/Chapter');
const User = require('../models/User');

/**
 * AI Analysis Service using Google Gemini
 * Provides weakness analysis, study recommendations, and personalized insights
 */
class AIAnalysisService {
    constructor() {
        if (process.env.GEMINI_API_KEY && process.env.ENABLE_AI_ANALYSIS === 'true') {
            this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
            this.enabled = true;
        } else {
            this.enabled = false;
            console.warn('⚠️  AI Analysis disabled - Gemini API key not configured');
        }
    }

    /**
     * Analyze test performance and identify weaknesses
     */
    async analyzeTestPerformance(testAttempt, user) {
        if (!this.enabled) {
            return this.getFallbackAnalysis(testAttempt);
        }

        try {
            const prompt = this.buildAnalysisPrompt(testAttempt, user);

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const analysis = response.text();

            return this.parseAIResponse(analysis);

        } catch (error) {
            console.error('AI Analysis error:', error);
            return this.getFallbackAnalysis(testAttempt);
        }
    }

    /**
     * Analyze a single quiz attempt summary (from QuizMeta + canonical questions)
     * and return markdown feedback for the student.
     */
    async analyzeLastQuizPerformance(summary) {
        if (!summary || typeof summary !== 'object') {
            return 'No data available for your last quiz yet.';
        }

        const { meta, byChapter, byDifficulty, wrongQuestions } = summary;

        // Basic rule-based fallback if Gemini analysis is disabled.
        if (!this.enabled) {
            const total = meta?.total || 0;
            const score = meta?.score || 0;
            const percentage = meta?.percentage || (total > 0 ? Math.round((score / total) * 100) : 0);

            const lines = [];
            lines.push('## Last quiz summary');
            lines.push('');
            lines.push(`- **Subject**: ${meta?.subject || 'Unknown'}`);
            lines.push(`- **Topic**: ${meta?.topic || 'Unknown'}`);
            if (meta?.date) {
                lines.push(`- **Date**: ${new Date(meta.date).toLocaleString()}`);
            }
            lines.push(`- **Score**: **${score}/${total}** (${percentage}%)`);
            lines.push('');

            if (Array.isArray(byChapter) && byChapter.length > 0) {
                lines.push('### Chapter-wise performance');
                byChapter.forEach((ch) => {
                    const correct = ch.correct || 0;
                    const t = ch.total || 0;
                    const acc = t > 0 ? Math.round((correct / t) * 100) : 0;
                    lines.push(`- **${ch.chapterId || 'Unknown'}**: ${acc}% (${correct}/${t})`);
                });
                lines.push('');
            }

            if (Array.isArray(wrongQuestions) && wrongQuestions.length > 0) {
                lines.push('### Recently weak questions');
                wrongQuestions.slice(0, 5).forEach((q, idx) => {
                    lines.push(`${idx + 1}. ${q.text || 'Question text unavailable.'}`);
                });
                lines.push('');
            }

            if (percentage >= 85) {
                lines.push('You did **excellent** on this quiz. Keep challenging yourself with mixed-topic tests.');
            } else if (percentage >= 60) {
                lines.push('Good work, but there is **room to improve**. Focus on the chapters where accuracy is below 70%.');
            } else {
                lines.push('This quiz shows **significant gaps**. Revisit NCERT theory for the weakest chapters and solve more basics first.');
            }

            return lines.join('\n');
        }

        try {
            const prompt = `You are a NEET performance coach. Given JSON about a student's last quiz, write a concise, structured markdown review.

Rules:
- Identify 2–4 **weak topics or chapters** and roughly how weak they are.
- Mention how many questions were wrong and any clear patterns.
- Suggest 2–3 **specific next actions** (e.g. reread a chapter, solve N questions, attempt a mixed quiz).
- Keep tone encouraging and practical.

Here is the JSON:
${JSON.stringify(summary, null, 2)}

Return ONLY markdown text (no JSON). Use headings and bullet points.`;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            if (!text || !text.trim()) {
                return 'Analysis is temporarily unavailable. Please try again later.';
            }

            return text.trim();
        } catch (error) {
            console.error('AI last quiz analysis error:', error);
            return 'Analysis is temporarily unavailable. Please try again later.';
        }
    }

    /**
     * Build prompt for AI analysis
     */
    buildAnalysisPrompt(testAttempt, user) {
        const { score, chapterAnalysis, difficultyAnalysis } = testAttempt;

        // Get weak chapters
        const weakChapters = chapterAnalysis
            .filter(ch => ch.accuracy < 60)
            .sort((a, b) => a.accuracy - b.accuracy)
            .slice(0, 5);

        // Get strong chapters
        const strongChapters = chapterAnalysis
            .filter(ch => ch.accuracy >= 80)
            .sort((a, b) => b.accuracy - a.accuracy)
            .slice(0, 3);

        const prompt = `
You are an expert NEET exam coach analyzing student performance. Provide actionable insights, identify weak areas, and suggest specific study strategies.

Analyze this NEET mock test performance:

Student Profile:
- Target Exam: ${user.primaryExam}
- Current Class: ${user.profile.class}
- Study Hours/Day: ${user.profile.studyHoursPerDay}
- Current Streak: ${user.gamification.currentStreak} days

Test Performance:
- Score: ${score.marksObtained}/${score.totalMarks} (${score.percentage}%)
- Questions Attempted: ${score.attempted}/${score.totalQuestions}
- Accuracy: ${Math.round((score.correct / score.attempted) * 100)}%

Physics: ${testAttempt.score.sections.find(s => s.subject === 'physics')?.marksObtained || 0}/180
Chemistry: ${testAttempt.score.sections.find(s => s.subject === 'chemistry')?.marksObtained || 0}/180
Biology: ${testAttempt.score.sections.find(s => s.subject === 'biology')?.marksObtained || 0}/360

Weak Chapters (< 60% accuracy):
${weakChapters.map(ch => `- ${ch.chapterId}: ${ch.accuracy}% (${ch.correct}/${ch.totalQuestions})`).join('\n')}

Strong Chapters (> 80% accuracy):
${strongChapters.map(ch => `- ${ch.chapterId}: ${ch.accuracy}% (${ch.correct}/${ch.totalQuestions})`).join('\n')}

Difficulty Analysis:
- Easy: ${difficultyAnalysis.easy.accuracy}% accuracy
- Medium: ${difficultyAnalysis.medium.accuracy}% accuracy
- Hard: ${difficultyAnalysis.hard.accuracy}% accuracy

Provide analysis in this JSON format:
{
  "overallAssessment": "Brief assessment of overall performance",
  "topWeaknesses": ["weakness1", "weakness2", "weakness3"],
  "strengths": ["strength1", "strength2"],
  "recommendations": {
    "immediate": ["action1", "action2"],
    "shortTerm": ["action1", "action2"],
    "longTerm": ["action1"]
  },
  "focusAreas": ["chapterId1", "chapterId2", "chapterId3"],
  "studyStrategy": "Suggested study approach",
  "timeManagement": "Analysis of time usage",
  "motivationalMessage": "Encouraging message"
}
`;

        return prompt;
    }

    /**
     * Parse AI response
     */
    parseAIResponse(response) {
        try {
            // Try to extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            // If no JSON, return structured text
            return {
                overallAssessment: response,
                topWeaknesses: [],
                strengths: [],
                recommendations: {
                    immediate: [],
                    shortTerm: [],
                    longTerm: []
                },
                focusAreas: [],
                studyStrategy: '',
                timeManagement: '',
                motivationalMessage: 'Keep practicing! Every test brings you closer to your goal.'
            };
        } catch (error) {
            console.error('Failed to parse AI response:', error);
            return this.getFallbackAnalysis();
        }
    }

    /**
     * Fallback analysis when AI is not available
     */
    getFallbackAnalysis(testAttempt = null) {
        if (!testAttempt) {
            return {
                overallAssessment: 'Analysis not available',
                topWeaknesses: [],
                strengths: [],
                recommendations: {
                    immediate: ['Focus on chapter-wise practice'],
                    shortTerm: ['Attempt more mock tests'],
                    longTerm: ['Build consistent study routine']
                },
                focusAreas: [],
                studyStrategy: 'Practice regularly and revise weak chapters',
                timeManagement: 'Track your study hours',
                motivationalMessage: 'Stay consistent and focused!'
            };
        }

        const { score, chapterAnalysis } = testAttempt;

        // Rule-based analysis
        const weakChapters = chapterAnalysis
            .filter(ch => ch.accuracy < 60)
            .sort((a, b) => a.accuracy - b.accuracy)
            .map(ch => ch.chapterId);

        const strongChapters = chapterAnalysis
            .filter(ch => ch.accuracy >= 80)
            .map(ch => ch.chapterId);

        let assessment = '';
        if (score.percentage >= 85) {
            assessment = 'Excellent performance! You\'re on track for a top rank.';
        } else if (score.percentage >= 70) {
            assessment = 'Good performance! Focus on weak areas to boost your score.';
        } else if (score.percentage >= 50) {
            assessment = 'Decent attempt. Significant improvement needed in multiple chapters.';
        } else {
            assessment = 'Needs attention. Let\'s build fundamentals and practice consistently.';
        }

        return {
            overallAssessment: assessment,
            topWeaknesses: weakChapters.slice(0, 3),
            strengths: strongChapters.slice(0, 2),
            recommendations: {
                immediate: [
                    `Focus on ${weakChapters.slice(0, 2).join(', ')}`,
                    'Practice 20 targeted MCQs daily'
                ],
                shortTerm: [
                    'Complete NCERT revision for weak chapters',
                    'Watch video explanations for difficult concepts'
                ],
                longTerm: [
                    'Maintain consistent study routine',
                    'Attempt weekly full-length mock tests'
                ]
            },
            focusAreas: weakChapters.slice(0, 3),
            studyStrategy: 'Start with your weakest chapter, practice 50 questions, then revise NCERT',
            timeManagement: score.attempted < score.totalQuestions ? 'Improve speed - you left questions unattempted' : 'Good time management',
            motivationalMessage: '🎯 Every mistake is a learning opportunity! Keep pushing forward!'
        };
    }

    /**
     * Generate personalized study plan
     */
    async generateStudyPlan(user, targetDate, focusAreas = []) {
        if (!this.enabled) {
            return this.getFallbackStudyPlan(user, targetDate);
        }

        try {
            const prompt = `
You are a NEET exam preparation expert.

Generate a personalized NEET study plan:

Student Profile:
- Target Exam Date: ${targetDate}
- Available Study Hours: ${user.profile.studyHoursPerDay} hours/day
- Current Class: ${user.profile.class}
- Focus Areas: ${focusAreas.join(', ') || 'All chapters'}

Requirements:
- Distribute study time across Physics, Chemistry, Biology (25:25:50 ratio)
- Include daily mock tests and revision
- Use spaced repetition for important chapters
- Account for student's energy levels (morning: tough chapters, evening: easy/revision)

Provide study plan in JSON format with daily tasks for next 7 days.
`;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            return this.parseStudyPlanResponse(text);

        } catch (error) {
            console.error('Study plan generation error:', error);
            return this.getFallbackStudyPlan(user, targetDate);
        }
    }

    /**
     * Parse study plan response
     */
    parseStudyPlanResponse(response) {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Fallback study plan
     */
    getFallbackStudyPlan(user, targetDate) {
        // Basic rule-based study plan
        const dailyHours = user.profile.studyHoursPerDay;

        return {
            dailySchedule: {
                morning: {
                    time: '06:00-09:00',
                    subjects: ['physics'],
                    activities: ['Tough chapter study', 'Problem solving']
                },
                afternoon: {
                    time: '14:00-17:00',
                    subjects: ['chemistry'],
                    activities: ['NCERT reading', 'Practice MCQs']
                },
                evening: {
                    time: '18:00-21:00',
                    subjects: ['biology'],
                    activities: ['Chapter completion', 'Mock test']
                }
            },
            weeklyGoals: {
                chapters: 5,
                mockTests: 2,
                revisionSessions: 3
            }
        };
    }
}

/**
 * Last quiz review analysis using Gemini.
 * Takes a structured summary object (built from QuizMeta + Question docs)
 * and returns markdown feedback about performance and next steps.
 */
AIAnalysisService.prototype.analyzeLastQuizPerformance = async function(summary) {
    if (!summary || !summary.meta) {
        return 'No data available for your last quiz yet.';
    }

    // If Gemini analysis is disabled, fall back to a simple rule-based summary.
    if (!this.enabled) {
        return this.buildLastQuizFallbackMarkdown(summary);
    }

    try {
        const prompt = this.buildLastQuizPrompt(summary);
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        if (text && String(text).trim().length > 0) {
            return text;
        }

        return this.buildLastQuizFallbackMarkdown(summary);
    } catch (error) {
        console.error('Last quiz analysis error:', error);
        return this.buildLastQuizFallbackMarkdown(summary);
    }
};

/**
 * Build Gemini prompt for last quiz performance review.
 */
AIAnalysisService.prototype.buildLastQuizPrompt = function(summary) {
    const meta = summary.meta || {};
    const byChapter = Array.isArray(summary.byChapter) ? summary.byChapter : [];
    const byDifficulty = summary.byDifficulty || {};
    const wrongQuestions = Array.isArray(summary.wrongQuestions) ? summary.wrongQuestions : [];

    const safeJson = JSON.stringify(
        {
            meta,
            byChapter,
            byDifficulty,
            wrongQuestions
        },
        null,
        2
    );

    const dateString = meta.date ? new Date(meta.date).toLocaleString() : 'Unknown';

    return `You are a NEET performance coach.
Given this JSON about a student's last AI-generated quiz, explain their performance and weak areas, and suggest concrete next steps.

Student's last quiz (metadata):
- Subject: ${meta.subject || 'Unknown'}
- Topic: ${meta.topic || 'Unknown'}
- Chapter ID: ${meta.chapterId || 'Unknown'}
- Date: ${dateString}
- Score: ${meta.score ?? 0}/${meta.total ?? 0}
- Percentage: ${meta.percentage ?? 0}%
- Time taken (seconds): ${meta.timeTaken ?? 0}

You are also given aggregated performance by chapter and difficulty, plus a list of wrong questions.

CRITICAL INSTRUCTIONS:
- Focus ONLY on the JSON provided. Do NOT invent numbers that are not implied by the JSON.
- Identify 2–4 weak topics/chapters with approximate accuracy.
- Mention how many questions were wrong and any patterns you see (chapters / difficulty).
- Suggest 2–3 specific next actions (e.g. reread chapter X, practice N questions on topic Y, do a mixed quiz).
- Write your answer as friendly, encouraging markdown with headings (##) and bullet points.
- Do NOT return JSON; return well-formatted markdown only.

Here is the summary JSON:
\`\`\`json
${safeJson}
\`\`\`
`;
};

/**
 * Simple rule-based markdown summary when Gemini is not available.
 */
AIAnalysisService.prototype.buildLastQuizFallbackMarkdown = function(summary) {
    const meta = summary?.meta || {};
    const byChapter = Array.isArray(summary?.byChapter) ? summary.byChapter : [];
    const byDifficulty = summary?.byDifficulty || {};
    const wrongQuestions = Array.isArray(summary?.wrongQuestions) ? summary.wrongQuestions : [];

    const total = typeof meta.total === 'number' ? meta.total : 0;
    const score = typeof meta.score === 'number' ? meta.score : 0;
    const percentage =
        typeof meta.percentage === 'number' && !Number.isNaN(meta.percentage)
            ? meta.percentage
            : total > 0
                ? Math.round((score / total) * 100)
                : 0;

    const dateString = meta.date ? new Date(meta.date).toLocaleString() : 'Unknown';
    const wrongCount = wrongQuestions.length;

    const weakChapters = byChapter
        .filter((c) => typeof c.accuracy === 'number' && c.accuracy < 60)
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, 4);

    const lines = [];

    lines.push('## Last quiz summary');
    lines.push('');
    lines.push(`- **Date**: ${dateString}`);
    lines.push(`- **Subject**: ${meta.subject || 'Unknown'}`);
    lines.push(`- **Topic**: ${meta.topic || 'Unknown'}`);
    lines.push(`- **Score**: **${score}/${total}** (${percentage}%)`);
    if (typeof meta.timeTaken === 'number') {
        lines.push(`- **Time taken**: ${Math.round(meta.timeTaken / 60)} min`);
    }

    lines.push('');
    lines.push('## Weak areas');
    if (weakChapters.length === 0) {
        lines.push('- **No clearly weak chapters detected** based on the available data.');
    } else {
        weakChapters.forEach((ch) => {
            lines.push(
                `- **Chapter ${ch.chapterId || ''}**: ${ch.accuracy ?? 0}% accuracy (${ch.correct ?? 0}/${
                    ch.total ?? 0
                } questions correct)`
            );
        });
    }

    lines.push('');
    lines.push('## Difficulty breakdown');
    const diffKeys = ['easy', 'medium', 'hard'];
    const anyDifficulty = diffKeys.some((k) => byDifficulty && byDifficulty[k]);
    if (!anyDifficulty) {
        lines.push('- Difficulty-wise breakdown is not available for this quiz.');
    } else {
        diffKeys.forEach((key) => {
            const bucket = byDifficulty[key];
            if (!bucket) return;
            const acc = typeof bucket.accuracy === 'number' ? bucket.accuracy : 0;
            const totalQ = typeof bucket.total === 'number' ? bucket.total : 0;
            const correctQ = typeof bucket.correct === 'number' ? bucket.correct : 0;
            lines.push(`- **${key[0].toUpperCase() + key.slice(1)}**: ${acc}% accuracy (${correctQ}/${totalQ})`);
        });
    }

    lines.push('');
    lines.push('## What to do next');
    if (wrongCount === 0) {
        lines.push(
            '- **Great job!** There are no clearly wrong questions recorded. Keep practicing similar quizzes to maintain your level.'
        );
    } else {
        lines.push(
            `- Review the **${wrongCount} question${wrongCount === 1 ? '' : 's'} you got wrong**, focusing on why the correct option is right.`
        );
        if (weakChapters.length > 0) {
            const chapterList = weakChapters
                .map((ch) => (ch.chapterId ? `Chapter ${ch.chapterId}` : 'this chapter'))
                .join(', ');
            lines.push(`- Revisit the NCERT theory and examples for: ${chapterList}.`);
        }
        lines.push('- Take another short quiz on the same topic within the next 1–2 days to reinforce learning.');
    }

    return lines.join('\n');
};

module.exports = new AIAnalysisService();
