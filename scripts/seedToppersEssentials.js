require('dotenv').config();
const mongoose = require('mongoose');
const ImportedCurriculum = require('../src/models/ImportedCurriculum');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error.message);
        process.exit(1);
    }
};

const seedToppersEssentials = async () => {
    try {
        await connectDB();
        
        const chapters = await ImportedCurriculum.find({}, { _id: 1, subject: 1 });
        console.log(`Found ${chapters.length} chapters. Seeding data...`);

        let count = 0;
        for (const chapter of chapters) {
            const dummyEssentials = {
                video: {
                    title: `${chapter._id} Overview Video`,
                    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                    time: '15:30'
                },
                mindmap: {
                    nodes: [
                        { id: '1', type: 'core', data: { label: chapter._id } },
                        { id: 'remove-me', type: 'detail', data: { label: 'Dummy Node' } }
                    ],
                    edges: [
                        { id: 'e1-2', source: '1', target: 'remove-me' }
                    ]
                },
                audio: 'https://example.com/audio/dummy.mp3',
                slidesdeck: {
                    title: `${chapter._id} Presentation Slides`,
                    url: 'https://example.com/slides/dummy.pdf'
                },
                report: 'https://example.com/reports/dummy-report.pdf',
                flashcards: 'https://example.com/flashcards/dummy-flashcards.pdf',
                infographic: 'https://example.com/infographics/dummy-infographic.pdf'
            };

            await ImportedCurriculum.updateOne(
                { _id: chapter._id, subject: chapter.subject },
                { $set: { toppersEssentials: dummyEssentials } }
            );
            count++;
        }

        console.log(`Successfully updated ${count} chapters with Toppers Essentials dummy data.`);
        process.exit(0);

    } catch (err) {
        console.error('Error seeding data:', err);
        process.exit(1);
    }
};

seedToppersEssentials();
