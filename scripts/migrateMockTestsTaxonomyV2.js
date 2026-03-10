require('dotenv').config();
const mongoose = require('mongoose');
const MockTest = require('../src/models/MockTest');
const TestSeries = require('../src/models/TestSeries');
const { syncMockTestTaxonomy } = require('../src/utils/testSeriesTaxonomy');

const parseArgs = () => {
    const args = process.argv.slice(2);
    const getValue = (flag, fallback) => {
        const idx = args.indexOf(flag);
        if (idx === -1 || idx + 1 >= args.length) return fallback;
        return args[idx + 1];
    };
    const dryRun = args.includes('--dry-run');
    const limit = Number(getValue('--limit', 0));
    return {
        dryRun,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 0
    };
};

async function recalcSeriesStats() {
    const grouped = await MockTest.aggregate([
        { $match: { seriesId: { $exists: true, $ne: null } } },
        { $group: { _id: '$seriesId', testsCount: { $sum: 1 } } }
    ]);

    for (const row of grouped) {
        await TestSeries.updateOne(
            { _id: row._id },
            { $set: { 'stats.testsCount': Number(row.testsCount || 0) } }
        );
    }
}

async function run() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing');
    }

    const { dryRun, limit } = parseArgs();
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`Connected to MongoDB. dryRun=${dryRun}`);

    const total = await MockTest.countDocuments({});
    console.log(`Mock tests found: ${total}`);

    const cursor = MockTest.find({})
        .sort({ _id: 1 })
        .cursor();

    let processed = 0;
    let updated = 0;
    let failed = 0;

    for await (const mockTest of cursor) {
        if (limit > 0 && processed >= limit) break;
        processed += 1;

        try {
            const patch = await syncMockTestTaxonomy(mockTest);
            if (!dryRun) {
                await MockTest.updateOne(
                    { _id: mockTest._id },
                    {
                        $set: {
                            seriesId: patch.seriesId || null,
                            taxonomyStatus: patch.taxonomyStatus,
                            testSeriesDetails: patch.testSeriesDetails,
                            facets: patch.facets,
                            taxonomy: patch.taxonomy,
                            'source.provider': patch.provider,
                            'source.externalId': mockTest.source?.externalId || mockTest.testId
                        }
                    }
                );
            }
            updated += 1;
        } catch (error) {
            failed += 1;
            console.error(`Failed test ${mockTest.testId}: ${error.message}`);
        }

        if (processed % 50 === 0) {
            console.log(`Processed ${processed}/${limit || total} ...`);
        }
    }

    if (!dryRun) {
        await recalcSeriesStats();
    }

    console.log('--- Migration summary ---');
    console.log(`Processed: ${processed}`);
    console.log(`Updated: ${updated}`);
    console.log(`Failed: ${failed}`);

    await mongoose.disconnect();
}

run().catch(async (error) => {
    console.error('Migration failed:', error.message);
    try {
        await mongoose.disconnect();
    } catch (e) {}
    process.exit(1);
});

