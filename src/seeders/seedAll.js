require('dotenv').config();
require('colors');
const mongoose = require('mongoose');
const Chapter = require('../models/Chapter');

// Import chapter data
const biologyChapters = require('./data/biologyChapters');
const physicsChapters = require('./data/physicsChapters');
const sampleQuestions = require('./data/questions');
const Question = require('../models/Question');

// Connect to database
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB Connected'.green.bold);
    } catch (error) {
        console.error(`❌ Error: ${error.message}`.red);
        process.exit(1);
    }
};

// Seed chapters
const seedChapters = async () => {
    try {
        console.log('\n📚 Seeding NCERT Chapters...'.cyan);

        // Delete existing chapters
        await Chapter.deleteMany({});
        console.log('🗑️  Deleted existing chapters'.yellow);

        // Combine all chapters
        const allChapters = [
            ...biologyChapters,
            ...physicsChapters
            // Add chemistry chapters when ready
        ];

        // Insert chapters
        const inserted = await Chapter.insertMany(allChapters);
        console.log(`✅ Inserted ${inserted.length} chapters`.green);

        // Seed Questions
        console.log('\n❓ Seeding Questions...'.cyan);
        await Question.deleteMany({});
        const insertedQuestions = await Question.insertMany(sampleQuestions);
        console.log(`✅ Inserted ${insertedQuestions.length} questions`.green);

        // Log statistics
        const stats = {
            total: inserted.length,
            biology: inserted.filter(c => c.subject === 'biology').length,
            physics: inserted.filter(c => c.subject === 'physics').length,
            chemistry: inserted.filter(c => c.subject === 'chemistry').length,
            mathematics: inserted.filter(c => c.subject === 'mathematics').length
        };

        console.log('\n📊 Chapter Statistics:'.cyan.bold);
        console.log(`   Total: ${stats.total}`.white);
        console.log(`   Biology: ${stats.biology}`.magenta);
        console.log(`   Physics: ${stats.physics}`.blue);
        console.log(`   Chemistry: ${stats.chemistry}`.green);
        console.log(`   Mathematics: ${stats.mathematics}`.yellow);

        // Show sample chapters
        console.log('\n📖 Sample Chapters:'.cyan.bold);
        const samples = inserted.slice(0, 3);
        samples.forEach(ch => {
            console.log(`   - ${ch.name.en} (${ch.subject})`.white);
            console.log(`     NEET Weight: ${ch.examWeights.NEET_UG.percentage}%`.gray);
        });

    } catch (error) {
        console.error(`❌ Error seeding chapters: ${error.message}`.red);
        throw error;
    }
};

// Main seed function
const seedAll = async () => {
    try {
        console.log('\n'.repeat(2));
        console.log('='.repeat(60).cyan);
        console.log('🌱 NEETForge Database Seeder'.green.bold);
        console.log('='.repeat(60).cyan);

        await connectDB();
        await seedChapters();

        console.log('\n' + '='.repeat(60).cyan);
        console.log('✅ Database seeding completed successfully!'.green.bold);
        console.log('='.repeat(60).cyan);
        console.log('\n');

        process.exit(0);
    } catch (error) {
        console.error(`\n❌ Seeding failed: ${error.message}`.red.bold);
        process.exit(1);
    }
};

// Run if called directly
if (require.main === module) {
    seedAll();
}

module.exports = { seedAll, seedChapters };
