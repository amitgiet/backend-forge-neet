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
            this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
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

module.exports = new AIAnalysisService();
