const Challenge = require('../models/Challenge');
const NCERTLine = require('../models/NCERTLine');

class ChallengeService {
    async createChallenge(userId, challengeData) {
        const { title, topic, subject, duration = 30 } = challengeData;
        
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + duration);
        
        // Find NCERT lines for topic - more lenient search
        let ncertLines = await NCERTLine.find({
            subject: { $regex: subject, $options: 'i' },
            isActive: true,
            $or: [
                { ncertText: { $regex: topic, $options: 'i' } },
                { conceptTags: { $regex: topic, $options: 'i' } }
            ]
        }).limit(duration * 5);
        
        // If no lines found, try searching just by subject
        if (ncertLines.length === 0) {
            ncertLines = await NCERTLine.find({
                subject: { $regex: subject, $options: 'i' },
                isActive: true
            }).limit(duration * 5);
        }
        
        // If still no lines, create a minimal challenge without NCERT content
        // This allows users to create challenges even if NCERT content is not seeded
        const hasNcertContent = ncertLines.length > 0;
        
        // Generate daily schedule
        const dailySchedule = [];
        const linesPerDay = ncertLines.length > 0 ? Math.ceil(ncertLines.length / duration) : 1;
        
        for (let day = 1; day <= duration; day++) {
            const dayDate = new Date(startDate);
            dayDate.setDate(dayDate.getDate() + (day - 1));
            
            const startIdx = (day - 1) * linesPerDay;
            const endIdx = Math.min(startIdx + linesPerDay, ncertLines.length);
            const dayLines = hasNcertContent ? ncertLines.slice(startIdx, endIdx) : [];
            
            dailySchedule.push({
                day,
                date: dayDate,
                quizzes: dayLines.map(line => ({
                    lineId: line._id,
                    quizCount: 4,
                    isCompleted: false
                })),
                targetQuizzes: dayLines.length || 4, // Default to 4 if no content
                completedQuizzes: 0,
                isUnlocked: day === 1,
                isCompleted: false
            });
        }
        
        const challenge = new Challenge({
            userId,
            title,
            topic,
            subject,
            duration,
            startDate,
            endDate,
            dailySchedule,
            progress: {
                currentDay: 1,
                completedDays: 0,
                totalQuizzes: Math.max(ncertLines.length, duration * 4),
                completedQuizzes: 0,
                averageScore: 0,
                streak: 0
            }
        });
        
        await challenge.save();
        return challenge;
    }

    async getUserChallenges(userId) {
        return await Challenge.find({ userId, isActive: true })
            .sort({ createdAt: -1 })
            .populate('dailySchedule.quizzes.lineId');
    }

    async getChallengeById(challengeId, userId) {
        return await Challenge.findOne({ _id: challengeId, userId })
            .populate('dailySchedule.quizzes.lineId');
    }

    async getTodaySchedule(challengeId, userId) {
        const GeminiService = require('./geminiService');
        const challenge = await Challenge.findOne({ _id: challengeId, userId })
            .populate('dailySchedule.quizzes.lineId');
        
        if (!challenge) throw new Error('Challenge not found');
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let todaySchedule = challenge.dailySchedule.find(schedule => {
            const scheduleDate = new Date(schedule.date);
            scheduleDate.setHours(0, 0, 0, 0);
            return scheduleDate.getTime() === today.getTime() && schedule.isUnlocked;
        });
        
        // Generate MCQ questions for today's quizzes if not already done
        if (todaySchedule && todaySchedule.quizzes && todaySchedule.quizzes.length > 0) {
            for (const quiz of todaySchedule.quizzes) {
                // If no MCQ questions generated yet
                if (!quiz.questions || quiz.questions.length === 0) {
                    const ncertLine = quiz.lineId;
                    if (ncertLine && ncertLine.ncertText) {
                        try {
                            const geminiService = new GeminiService();
                            const generatedQuizzes = await geminiService.generateMicroQuizzes({
                                ncertText: ncertLine.ncertText,
                                subject: challenge.subject,
                                class: ncertLine.class,
                                chapter: ncertLine.chapter
                            });
                            
                            quiz.questions = generatedQuizzes.slice(0, 4).map(q => ({
                                question: q.question,
                                options: q.options,
                                correctAnswer: q.correctAnswer,
                                explanation: q.explanation
                            }));
                        } catch (error) {
                            console.error('Error generating quizzes for challenge:', error);
                            // Fallback: create placeholder questions
                            quiz.questions = [
                                {
                                    question: 'What is the main concept discussed in this section?',
                                    options: ['Option A', 'Option B', 'Option C', 'Option D'],
                                    correctAnswer: 0,
                                    explanation: 'Based on NCERT content'
                                }
                            ];
                        }
                    }
                }
            }
        }
        
        return {
            challenge,
            todaySchedule: todaySchedule || null,
            isCompleted: !todaySchedule || todaySchedule.isCompleted
        };
    }

    async completeQuiz(challengeId, userId, dayNumber, quizIndex, score, timeSpent) {
        const challenge = await Challenge.findOne({ _id: challengeId, userId });
        
        if (!challenge) throw new Error('Challenge not found');
        
        const daySchedule = challenge.dailySchedule.find(s => s.day === dayNumber);
        
        if (!daySchedule) throw new Error('Day not found');
        if (!daySchedule.isUnlocked) throw new Error('Day not unlocked yet');
        
        const quiz = daySchedule.quizzes[quizIndex];
        if (!quiz) throw new Error('Quiz not found');
        
        quiz.isCompleted = true;
        quiz.completedAt = new Date();
        quiz.score = score;
        quiz.timeSpent = timeSpent;
        
        daySchedule.completedQuizzes += 1;
        
        if (daySchedule.completedQuizzes >= daySchedule.targetQuizzes) {
            daySchedule.isCompleted = true;
            challenge.progress.completedDays += 1;
            
            // Unlock next day
            const nextDay = challenge.dailySchedule.find(s => s.day === dayNumber + 1);
            if (nextDay) {
                nextDay.isUnlocked = true;
                challenge.progress.currentDay = dayNumber + 1;
            }
            
            // Update streak
            challenge.progress.streak += 1;
        }
        
        challenge.progress.completedQuizzes += 1;
        
        // Calculate average score
        let totalScore = 0;
        let completedCount = 0;
        challenge.dailySchedule.forEach(day => {
            day.quizzes.forEach(q => {
                if (q.isCompleted && q.score !== undefined) {
                    totalScore += q.score;
                    completedCount += 1;
                }
            });
        });
        challenge.progress.averageScore = completedCount > 0 ? Math.round(totalScore / completedCount) : 0;
        
        // Check if challenge completed
        if (challenge.progress.completedDays === challenge.duration) {
            challenge.status = 'completed';
        }
        
        await challenge.save();
        return challenge;
    }

    async deleteChallenge(challengeId, userId) {
        const challenge = await Challenge.findOne({ _id: challengeId, userId });
        
        if (!challenge) throw new Error('Challenge not found');
        
        challenge.isActive = false;
        challenge.status = 'abandoned';
        await challenge.save();
        
        return { message: 'Challenge deleted successfully' };
    }
}

module.exports = ChallengeService;
