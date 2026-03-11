require('dotenv').config();
const mongoose = require('mongoose');
const ImportedCurriculum = require('../src/models/ImportedCurriculum');

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const chapters = await ImportedCurriculum.find(
        { 'toppersEssentials.video.url': { $exists: true, $ne: null } },
        { _id: 1, 'toppersEssentials.video': 1 }
    );
    for (const ch of chapters) {
        console.log(`\n${ch._id}`);
        console.log(`  URL: ${ch.toppersEssentials?.video?.url}`);
    }
    await mongoose.disconnect();
    process.exit(0);
};
run().catch(err => { console.error(err); process.exit(1); });
