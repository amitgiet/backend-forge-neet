// Exam configurations - Easy to add new exams
const EXAM_CONFIGS = {
    NEET_UG: {
        name: 'NEET UG',
        fullName: 'National Eligibility cum Entrance Test (Undergraduate)',
        subjects: ['physics', 'chemistry', 'biology'],
        totalQuestions: 200,
        totalMarks: 720,
        duration: 200, // minutes
        sections: [
            {
                name: 'Physics',
                subject: 'physics',
                questionsCount: 50,
                marksPerQuestion: 4
            },
            {
                name: 'Chemistry',
                subject: 'chemistry',
                questionsCount: 50,
                marksPerQuestion: 4
            },
            {
                name: 'Biology',
                subject: 'biology',
                questionsCount: 100,
                marksPerQuestion: 4
            }
        ],
        markingScheme: {
            correct: 4,
            incorrect: -1,
            unattempted: 0
        },
        cutoffPercentile: 50, // General category
        targetScore: 650 // For top colleges
    },

    JEE_MAIN: {
        name: 'JEE Main',
        fullName: 'Joint Entrance Examination (Main)',
        subjects: ['physics', 'chemistry', 'mathematics'],
        totalQuestions: 90,
        totalMarks: 300,
        duration: 180, // minutes
        sections: [
            {
                name: 'Physics',
                subject: 'physics',
                questionsCount: 30,
                marksPerQuestion: 4
            },
            {
                name: 'Chemistry',
                subject: 'chemistry',
                questionsCount: 30,
                marksPerQuestion: 4
            },
            {
                name: 'Mathematics',
                subject: 'mathematics',
                questionsCount: 30,
                marksPerQuestion: 4
            }
        ],
        markingScheme: {
            correct: 4,
            incorrect: -1,
            unattempted: 0
        },
        cutoffPercentile: 90,
        targetScore: 250
    },

    JEE_ADVANCED: {
        name: 'JEE Advanced',
        fullName: 'Joint Entrance Examination (Advanced)',
        subjects: ['physics', 'chemistry', 'mathematics'],
        totalQuestions: 54,
        totalMarks: 180,
        duration: 180, // minutes per paper
        papers: 2,
        markingScheme: {
            correct: 3,
            incorrect: -1,
            partialCorrect: 1,
            unattempted: 0
        },
        cutoffPercentile: 95,
        targetScore: 150
    },

    BITSAT: {
        name: 'BITSAT',
        fullName: 'Birla Institute of Technology and Science Admission Test',
        subjects: ['physics', 'chemistry', 'mathematics', 'english', 'logical_reasoning'],
        totalQuestions: 150,
        totalMarks: 450,
        duration: 180,
        markingScheme: {
            correct: 3,
            incorrect: -1,
            unattempted: 0
        },
        cutoffPercentile: 85,
        targetScore: 350
    },

    AIIMS: {
        name: 'AIIMS',
        fullName: 'All India Institute of Medical Sciences',
        subjects: ['physics', 'chemistry', 'biology', 'general_knowledge'],
        totalQuestions: 200,
        totalMarks: 200,
        duration: 210,
        markingScheme: {
            correct: 1,
            incorrect: -0.33,
            unattempted: 0
        },
        cutoffPercentile: 95,
        targetScore: 170
    }
};

// Subject configurations
const SUBJECT_CONFIGS = {
    physics: {
        name: { en: 'Physics', hi: 'भौतिक विज्ञान' },
        color: '#3B82F6',
        icon: '⚛️',
        ncertClasses: [11, 12],
        totalChapters: {
            class11: 15,
            class12: 15
        }
    },
    chemistry: {
        name: { en: 'Chemistry', hi: 'रसायन विज्ञान' },
        color: '#10B981',
        icon: '🧪',
        ncertClasses: [11, 12],
        totalChapters: {
            class11: 14,
            class12: 16
        }
    },
    biology: {
        name: { en: 'Biology', hi: 'जीव विज्ञान' },
        color: '#8B5CF6',
        icon: '🧬',
        ncertClasses: [11, 12],
        totalChapters: {
            class11: 22,
            class12: 16
        }
    },
    mathematics: {
        name: { en: 'Mathematics', hi: 'गणित' },
        color: '#F59E0B',
        icon: '📐',
        ncertClasses: [11, 12],
        totalChapters: {
            class11: 16,
            class12: 13
        }
    }
};

// Difficulty levels
const DIFFICULTY_LEVELS = {
    EASY: {
        label: 'Easy',
        score: 1,
        timeMultiplier: 0.8,
        color: '#10B981'
    },
    MEDIUM: {
        label: 'Medium',
        score: 5,
        timeMultiplier: 1.0,
        color: '#F59E0B'
    },
    HARD: {
        label: 'Hard',
        score: 10,
        timeMultiplier: 1.3,
        color: '#EF4444'
    }
};

// Subscription plans
const SUBSCRIPTION_PLANS = {
    FREE: {
        name: 'Free',
        price: 0,
        features: {
            mocksPerDay: 3,
            weaknessAnalysis: true,
            studyPlan: false,
            aiCoaching: false,
            pyqAccess: 'limited', // Last 5 years
            ncertSearch: true,
            videoExplanations: false,
            ads: true,
            prioritySupport: false
        }
    },
    PRO: {
        name: 'Pro',
        price: 149, // ₹149/month
        priceYearly: 1499, // ₹1499/year
        features: {
            mocksPerDay: -1, // Unlimited
            weaknessAnalysis: true,
            studyPlan: true,
            aiCoaching: true,
            pyqAccess: 'full', // All years
            ncertSearch: true,
            videoExplanations: true,
            ads: false,
            prioritySupport: true,
            offlineMode: true
        }
    },
    ULTIMATE: {
        name: 'Ultimate',
        price: 299, // ₹299/month
        priceYearly: 2999, // ₹2999/year
        features: {
            mocksPerDay: -1,
            weaknessAnalysis: true,
            studyPlan: true,
            aiCoaching: true,
            pyqAccess: 'full',
            ncertSearch: true,
            videoExplanations: true,
            ads: false,
            prioritySupport: true,
            offlineMode: true,
            personalMentor: true,
            liveClasses: true,
            doubtSolving: true
        }
    }
};

// Gamification configs
const GAMIFICATION_CONFIGS = {
    coins: {
        dailyLogin: 10,
        completeChapter: 50,
        mockTestAttempt: 30,
        mockTestScore90Plus: 100,
        weekStreak: 100,
        monthStreak: 500,
        referFriend: 200
    },

    xp: {
        questionCorrect: 10,
        questionIncorrect: 2,
        chapterComplete: 500,
        mockComplete: 300,
        dailyGoalMet: 100
    },

    levels: [
        { level: 1, xpRequired: 0, title: 'Beginner' },
        { level: 2, xpRequired: 1000, title: 'Novice' },
        { level: 3, xpRequired: 2500, title: 'Learner' },
        { level: 4, xpRequired: 5000, title: 'Student' },
        { level: 5, xpRequired: 10000, title: 'Scholar' },
        { level: 6, xpRequired: 20000, title: 'Expert' },
        { level: 7, xpRequired: 40000, title: 'Master' },
        { level: 8, xpRequired: 80000, title: 'Champion' },
        { level: 9, xpRequired: 150000, title: 'Legend' },
        { level: 10, xpRequired: 300000, title: 'NEET Warrior' }
    ],

    badges: [
        { id: 'first_mock', name: 'First Steps', description: 'Complete your first mock test' },
        { id: 'week_streak_7', name: '7-Day Warrior', description: 'Maintain 7-day study streak' },
        { id: 'week_streak_30', name: 'Month Master', description: 'Maintain 30-day study streak' },
        { id: 'accuracy_90', name: 'Sharpshooter', description: 'Achieve 90%+ accuracy in a mock' },
        { id: 'mock_master', name: 'Mock Master', description: 'Attempt 100 mock tests' },
        { id: 'biology_expert', name: 'Biology Expert', description: 'Master 90% biology chapters' },
        { id: 'physics_expert', name: 'Physics Expert', description: 'Master 90% physics chapters' },
        { id: 'chemistry_expert', name: 'Chemistry Expert', description: 'Master 90% chemistry chapters' }
    ]
};

// Spaced repetition intervals (in days)
const SPACED_REPETITION_INTERVALS = [1, 3, 7, 15, 30, 60];

module.exports = {
    EXAM_CONFIGS,
    SUBJECT_CONFIGS,
    DIFFICULTY_LEVELS,
    SUBSCRIPTION_PLANS,
    GAMIFICATION_CONFIGS,
    SPACED_REPETITION_INTERVALS
};
