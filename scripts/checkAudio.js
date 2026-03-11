require('dotenv').config();
const mongoose = require('mongoose');
const ImportedCurriculum = require('../src/models/ImportedCurriculum');

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const chapter = await ImportedCurriculum.findOne({ _id: 'GENETICS AND EVOLUTION' });
    if (chapter) {
        console.log(`Audio URL: ${chapter.toppersEssentials?.audio}`);
    } else {
        console.log('Chapter not found.');
    }
    await mongoose.disconnect();
    process.exit(0);
};

run().catch(console.error);
