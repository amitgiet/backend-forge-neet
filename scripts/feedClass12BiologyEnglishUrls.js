require('dotenv').config();
require('colors');
const mongoose = require('mongoose');
const Chapter = require('../src/models/Chapter');

const chapterNames = [
    'Sexual Reproduction in Flowering Plants',
    'Human Reproduction',
    'Reproductive Health',
    'Principles of Inheritance and Variation',
    'Molecular Basis of Inheritance',
    'Evolution',
    'Human Health and Disease',
    'Microbes in Human Welfare',
    'Strategies for Enhancement in Food Production',
    'Biotechnology: Principles and Processes',
    'Biotechnology and its Applications',
    'Organisms and Populations',
    'Ecosystem'
];

const buildUrl = (chapterNumber) =>
    `https://ncert.nic.in/textbook/pdf/lebo1${String(chapterNumber).padStart(2, '0')}.pdf`;

const slugify = (value) =>
    String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

const run = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB'.green);

        const existing = await Chapter.find({
            subject: 'biology',
            'ncert.class': 12,
            'ncert.chapterNumber': { $in: Array.from({ length: 13 }, (_, i) => i + 1) }
        }).select('chapterId ncert.chapterNumber name contentSource examWeights tags estimatedStudyTime');

        const map = new Map(existing.map((chapter) => [chapter.ncert.chapterNumber, chapter]));
        let updated = 0;
        let created = 0;

        for (let chapterNumber = 1; chapterNumber <= 13; chapterNumber++) {
            const chapter = map.get(chapterNumber);
            const nameEn = chapterNames[chapterNumber - 1];
            const url = buildUrl(chapterNumber);

            if (!chapter) {
                const chapterId = `biology_c12_${slugify(nameEn)}`;
                await Chapter.create({
                    chapterId,
                    name: {
                        en: nameEn,
                        hi: nameEn
                    },
                    subject: 'biology',
                    ncert: {
                        class: 12,
                        chapterNumber
                    },
                    examWeights: {
                        NEET_UG: {
                            percentage: 0,
                            questionsCount: 0,
                            marksPerQuestion: 4,
                            difficulty: { easy: 0, medium: 0, hard: 0 }
                        }
                    },
                    tags: ['biology', 'class-12', 'ncert'],
                    estimatedStudyTime: 10,
                    contentSource: {
                        en: {
                            resourceType: 'pdf',
                            resourceUrl: url
                        }
                    }
                });
                created++;
                console.log(`Created c${chapterNumber}: ${chapterId}`.green);
            } else {
                chapter.name = {
                    en: nameEn,
                    hi: chapter.name?.hi || nameEn
                };
                chapter.contentSource = {
                    ...(chapter.contentSource || {}),
                    en: {
                        resourceType: 'pdf',
                        resourceUrl: url
                    }
                };
                await chapter.save();
                updated++;
                console.log(`Updated c${chapterNumber}: ${chapter.chapterId}`.cyan);
            }
        }

        console.log(`Total updated: ${updated}`.green);
        console.log(`Total created: ${created}`.green);
        process.exit(0);
    } catch (error) {
        console.error(`Failed: ${error.message}`.red);
        process.exit(1);
    }
};

run();
