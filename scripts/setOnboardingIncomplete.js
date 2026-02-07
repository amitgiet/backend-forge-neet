require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const setOnboardingIncomplete = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB Connected');

        const user = await User.findOne({ email: 'demo@neetforge.com' });
        
        if (!user) {
            console.log('❌ User not found');
            process.exit(1);
        }

        user.onboarding = {
            completed: false,
            currentStep: 1
        };

        await user.save();
        
        console.log('✅ Demo user onboarding set to incomplete');
        console.log(`Email: demo@neetforge.com`);
        console.log(`Onboarding Step: ${user.onboarding.currentStep}`);
        console.log(`Completed: ${user.onboarding.completed}`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
};

setOnboardingIncomplete();
