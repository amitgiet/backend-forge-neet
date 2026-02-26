require('dotenv').config();
require('colors');
const mongoose = require('mongoose');
const Chapter = require('../src/models/Chapter');
const Topic = require('../src/models/Topic');

const normalizeOne = (contentSource) => {
    if (!contentSource) return null;
    if (contentSource.en || contentSource.hi) return null;
    if (!contentSource.resourceUrl) return null;
    return {
        en: {
            resourceType: contentSource.resourceType || 'external',
            resourceUrl: contentSource.resourceUrl
        }
    };
};

const run = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB'.green);

        const chapters = await Chapter.find({ 'contentSource.resourceUrl': { $exists: true, $ne: null } });
        let chapterUpdates = 0;
        for (const chapter of chapters) {
            const normalized = normalizeOne(chapter.contentSource);
            if (!normalized) continue;
            chapter.contentSource = normalized;
            await chapter.save();
            chapterUpdates++;
        }

        const topics = await Topic.find({ 'contentSource.resourceUrl': { $exists: true, $ne: null } });
        let topicUpdates = 0;
        for (const topic of topics) {
            const normalized = normalizeOne(topic.contentSource);
            if (!normalized) continue;
            topic.contentSource = normalized;
            await topic.save();
            topicUpdates++;
        }

        console.log(`Updated chapters: ${chapterUpdates}`.cyan);
        console.log(`Updated topics: ${topicUpdates}`.cyan);
        process.exit(0);
    } catch (error) {
        console.error(`Failed: ${error.message}`.red);
        process.exit(1);
    }
};

run();
