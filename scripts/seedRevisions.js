require('dotenv').config();
const mongoose = require('mongoose');
const RevisionSchedule = require('../src/models/RevisionSchedule');
const User = require('../src/models/User');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
};

const seedRevisions = async () => {
  try {
    await connectDB();

    // Find demo user
    const demoUser = await User.findOne({ email: 'demo@neetforge.com' });
    if (!demoUser) {
      console.log('❌ Demo user not found. Run seedDemoUser.js first.');
      process.exit(1);
    }

    // Clear existing revisions
    await RevisionSchedule.deleteMany({ userId: demoUser._id });

    const now = new Date();
    const topics = [
      // Physics
      { subject: 'Physics', chapter: 'Mechanics', topic: "Newton's Laws of Motion", level: 3, daysAgo: 2 },
      { subject: 'Physics', chapter: 'Thermodynamics', topic: 'Laws of Thermodynamics', level: 2, daysAgo: 0 },
      { subject: 'Physics', chapter: 'Electromagnetism', topic: "Coulomb's Law", level: 4, daysAgo: 8 },
      { subject: 'Physics', chapter: 'Optics', topic: 'Reflection and Refraction', level: 5, daysAgo: 31 },
      
      // Chemistry
      { subject: 'Chemistry', chapter: 'Physical Chemistry', topic: 'Chemical Equilibrium', level: 3, daysAgo: 1 },
      { subject: 'Chemistry', chapter: 'Organic Chemistry', topic: 'Alkanes and Alkenes', level: 2, daysAgo: 0 },
      { subject: 'Chemistry', chapter: 'Inorganic Chemistry', topic: 'Periodic Table Trends', level: 4, daysAgo: 7 },
      
      // Biology
      { subject: 'Biology', chapter: 'Cell Biology', topic: 'Cell Division - Mitosis', level: 3, daysAgo: 2 },
      { subject: 'Biology', chapter: 'Genetics', topic: "Mendel's Laws", level: 5, daysAgo: 30 },
      { subject: 'Biology', chapter: 'Human Physiology', topic: 'Circulatory System', level: 2, daysAgo: 0 },
      { subject: 'Biology', chapter: 'Ecology', topic: 'Ecosystem Structure', level: 4, daysAgo: 9 },
    ];

    const revisions = [];
    for (const topic of topics) {
      const learnDate = new Date(now.getTime() - topic.daysAgo * 24 * 60 * 60 * 1000);
      
      const revision = new RevisionSchedule({
        userId: demoUser._id,
        subject: topic.subject,
        chapter: topic.chapter,
        topic: topic.topic,
        currentLevel: topic.level,
        scheduledDates: {
          level1: learnDate,
          level2: new Date(learnDate.getTime() + 0 * 24 * 60 * 60 * 1000),
          level3: new Date(learnDate.getTime() + 1 * 24 * 60 * 60 * 1000),
          level4: new Date(learnDate.getTime() + 7 * 24 * 60 * 60 * 1000),
          level5: new Date(learnDate.getTime() + 30 * 24 * 60 * 60 * 1000)
        },
        lastRevisedAt: learnDate,
        nextRevisionDue: now, // Due today
        revisions: [
          {
            level: 1,
            completedAt: learnDate,
            score: 75 + Math.floor(Math.random() * 20),
            timeSpent: 15 + Math.floor(Math.random() * 10),
            confidence: 'medium'
          }
        ]
      });

      // Add more revision history for higher levels
      for (let i = 2; i <= topic.level; i++) {
        revision.revisions.push({
          level: i,
          completedAt: new Date(learnDate.getTime() + (i - 1) * 24 * 60 * 60 * 1000),
          score: 70 + Math.floor(Math.random() * 25),
          timeSpent: 10 + Math.floor(Math.random() * 15),
          confidence: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)]
        });
      }

      revision.calculateRetention();
      revision.updatePriority();
      revisions.push(revision);
    }

    await RevisionSchedule.insertMany(revisions);

    console.log('✅ Successfully seeded revision data:');
    console.log(`   - ${revisions.length} topics tracked`);
    console.log(`   - Across 3 subjects (Physics, Chemistry, Biology)`);
    console.log(`   - Levels 2-5 distributed`);
    console.log(`   - All due for revision today`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding revisions:', error);
    process.exit(1);
  }
};

seedRevisions();
