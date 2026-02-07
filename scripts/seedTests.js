require('dotenv').config();
const mongoose = require('mongoose');
const Test = require('../src/models/Test');
const Question = require('../src/models/Question');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
};

const seedTests = async () => {
  try {
    await connectDB();

    // Clear existing tests
    await Test.deleteMany({});

    // Get sample questions
    const physicsQuestions = await Question.find({ subject: 'Physics' }).limit(50);
    const chemistryQuestions = await Question.find({ subject: 'Chemistry' }).limit(50);
    const biologyQuestions = await Question.find({ subject: 'Biology' }).limit(100);

    const tests = [
      // Full-Length NEET Mock
      {
        title: 'NEET 2024 Full Mock Test #1',
        type: 'full-length-mock',
        config: {
          duration: 180,
          totalQuestions: 200,
          subjects: ['Physics', 'Chemistry', 'Biology'],
          difficulty: 'mixed',
          negativeMarking: true,
          marksPerQuestion: 4,
          negativeMarks: -1
        },
        distribution: {
          physics: 50,
          chemistry: 50,
          biology: 100
        },
        questions: [
          ...physicsQuestions.slice(0, 50).map(q => q._id),
          ...chemistryQuestions.slice(0, 50).map(q => q._id),
          ...biologyQuestions.slice(0, 100).map(q => q._id)
        ],
        isPremium: false
      },

      // Full-Length CBT
      {
        title: 'NEET CBT Simulation Test',
        type: 'full-length-cbt',
        config: {
          duration: 180,
          totalQuestions: 200,
          subjects: ['Physics', 'Chemistry', 'Biology'],
          difficulty: 'mixed',
          negativeMarking: true,
          marksPerQuestion: 4,
          negativeMarks: -1
        },
        distribution: {
          physics: 50,
          chemistry: 50,
          biology: 100
        },
        questions: [
          ...physicsQuestions.slice(0, 50).map(q => q._id),
          ...chemistryQuestions.slice(0, 50).map(q => q._id),
          ...biologyQuestions.slice(0, 100).map(q => q._id)
        ],
        isPremium: true
      },

      // NCERT Focus Test
      {
        title: 'NCERT Focus Test - Biology',
        type: 'ncert-focus',
        config: {
          duration: 60,
          totalQuestions: 50,
          subjects: ['Biology'],
          difficulty: 'mixed',
          ncertOnly: true,
          negativeMarking: true,
          marksPerQuestion: 4,
          negativeMarks: -1
        },
        questions: biologyQuestions.slice(0, 50).map(q => q._id),
        isPremium: false
      },

      // Chapter-Wise Test
      {
        title: 'Cell Biology - Chapter Test',
        type: 'chapter-wise',
        config: {
          duration: 45,
          totalQuestions: 30,
          subjects: ['Biology'],
          chapters: ['Cell Biology'],
          difficulty: 'mixed',
          negativeMarking: true,
          marksPerQuestion: 4,
          negativeMarks: -1
        },
        questions: biologyQuestions.slice(0, 30).map(q => q._id),
        isPremium: false
      },

      // Subject-Specific Test
      {
        title: 'Physics Complete Test',
        type: 'subject-specific',
        config: {
          duration: 90,
          totalQuestions: 50,
          subjects: ['Physics'],
          difficulty: 'mixed',
          negativeMarking: true,
          marksPerQuestion: 4,
          negativeMarks: -1
        },
        questions: physicsQuestions.map(q => q._id),
        isPremium: false
      },

      {
        title: 'Chemistry Complete Test',
        type: 'subject-specific',
        config: {
          duration: 90,
          totalQuestions: 50,
          subjects: ['Chemistry'],
          difficulty: 'mixed',
          negativeMarking: true,
          marksPerQuestion: 4,
          negativeMarks: -1
        },
        questions: chemistryQuestions.map(q => q._id),
        isPremium: false
      }
    ];

    await Test.insertMany(tests);

    console.log('✅ Successfully seeded test data:');
    console.log(`   - ${tests.length} tests created`);
    console.log('   - Full-Length NEET Mock');
    console.log('   - Full-Length CBT (Premium)');
    console.log('   - NCERT Focus Test');
    console.log('   - Chapter-Wise Test');
    console.log('   - Subject-Specific Tests (Physics, Chemistry)');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding tests:', error);
    process.exit(1);
  }
};

seedTests();
