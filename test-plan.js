require('dotenv').config();
const mongoose = require('mongoose');
const aiAnalysisService = require('./src/services/aiAnalysisService');

async function testPlan() {
    await mongoose.connect(process.env.MONGODB_URI);

    const mockUser = {
        _id: 'testuser123',
        profile: { studyHoursPerDay: 6 },
        primaryExam: 'NEET_UG'
    };

    const plan = await aiAnalysisService.generateStudyPlan(mockUser, new Date('2027-05-01'), ['physics-1', 'biology-2']);

    console.log(JSON.stringify(plan, null, 2));

    mongoose.disconnect();
}

testPlan().catch(console.error);
