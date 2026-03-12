require('dotenv').config();
require('colors');
const mongoose = require('mongoose');
const UserActivityService = require('./src/services/userActivityService');
const AITools = require('./src/services/aiTools');
const connectDB = require('./src/config/database');

async function test() {
    await connectDB();
    const userId = new mongoose.Types.ObjectId(); // Dummy user id
    console.log('Logging mock activities...');
    await UserActivityService.logActivity(userId, 'mock_test_submitted', { testId: 'NEET_MOCK_01', score: 650, total: 720 });
    await UserActivityService.logActivity(userId, 'curriculum_topic_completed', { subject: 'physics', chapterId: 'kinematics', percentage: 90 });

    console.log('Retrieving AI flow data...');
    const flow = await AITools.getCurrentStudyFlow(userId, 7);
    console.log('Flow data:', JSON.stringify(flow, null, 2));

    await mongoose.connection.close();
}

test().catch(err => { console.error(err); mongoose.connection.close(); });
