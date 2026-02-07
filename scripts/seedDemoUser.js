require('dotenv').config();
require('colors');
const mongoose = require('mongoose');
const User = require('../src/models/User');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB Connected'.cyan.bold);
    } catch (error) {
        console.error(`❌ Error: ${error.message}`.red.bold);
        process.exit(1);
    }
};

const seedDemoUser = async () => {
    try {
        await connectDB();

        const existingUser = await User.findOne({ email: 'demo@neetforge.com' });
        
        if (existingUser) {
            console.log('⚠️  Demo user already exists!'.yellow);
            console.log(`Email: demo@neetforge.com`);
            console.log(`Password: demo123`);
            process.exit(0);
        }

        const demoUser = await User.create({
            name: 'Demo Student',
            email: 'demo@neetforge.com',
            password: 'demo123',
            phone: '9876543210',
            exams: [{
                examType: 'NEET_UG',
                targetYear: 2025,
                targetScore: 650,
                isActive: true
            }],
            primaryExam: 'NEET_UG',
            profile: {
                class: 12,
                coachingInstitute: 'Self-Study',
                preferredLanguage: 'en',
                studyHoursPerDay: 6,
                state: 'Maharashtra',
                city: 'Mumbai'
            },
            subscription: {
                plan: 'pro',
                status: 'active',
                startDate: new Date(),
                endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
            },
            gamification: {
                coins: 500,
                totalXP: 2500,
                level: 5,
                currentStreak: 7,
                longestStreak: 15,
                lastStudyDate: new Date()
            },
            analytics: {
                totalStudyTime: 1200,
                totalMocksAttempted: 5,
                totalQuestionsAttempted: 500,
                totalQuestionsCorrect: 375,
                overallAccuracy: 75,
                predictedScore: 580,
                weeklyGoalHours: 42,
                weeklyCompletedHours: 28
            },
            isActive: true,
            isEmailVerified: true
        });

        console.log('✅ Demo user created successfully!'.green.bold);
        console.log('\n📧 Login Credentials:'.cyan.bold);
        console.log(`Email: demo@neetforge.com`.yellow);
        console.log(`Password: demo123`.yellow);
        console.log(`\n🎮 Stats:`.cyan.bold);
        console.log(`Level: ${demoUser.gamification.level}`);
        console.log(`XP: ${demoUser.gamification.totalXP}`);
        console.log(`Streak: ${demoUser.gamification.currentStreak} days`);
        
        process.exit(0);
    } catch (error) {
        console.error(`❌ Error: ${error.message}`.red.bold);
        process.exit(1);
    }
};

seedDemoUser();
