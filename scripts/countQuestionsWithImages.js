require('dotenv').config();
const mongoose = require('mongoose');
const IQ = require('../src/models/ImportedQuestion');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const withImageId = await IQ.countDocuments({
        imageId: { $exists: true, $nin: [null, '', 'null', 'undefined'] }
    });

    const diagramInTextNoImageId = await IQ.countDocuments({
        imageId: { $in: [null, '', 'null', 'undefined', undefined] },
        question: { $regex: /diagram\(\w+\)/i }
    });

    const uniqueIds = await IQ.distinct('imageId', {
        imageId: { $exists: true, $nin: [null, '', 'null', 'undefined'] }
    });

    console.log('===== VERIFICATION =====\n');
    console.log(`Questions with imageId field set      : ${withImageId}`);
    console.log(`Questions with diagram in text but    `);
    console.log(`  missing imageId (should be 0)       : ${diagramInTextNoImageId}`);
    console.log(`Unique imageId values                 : ${uniqueIds.length}`);
    console.log(`\n${diagramInTextNoImageId === 0 ? '✅ All good! Every image question now has imageId set.' : '⚠️  Some questions still missing imageId!'}`);
    process.exit(0);
});
