require('dotenv').config();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Match what database schema requires
const ImportedCurriculum = require('../src/models/ImportedCurriculum');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI);
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ Error connecting to MongoDB: ${error.message}`);
        process.exit(1);
    }
};

const updateMindmaps = async () => {
    await connectDB();
    console.log('Starting mindmap migration...');
    
    // Path to the mindmap JSON file
    const mindmapPath = path.join(__dirname, '../uploads/Topperessentials/mindmap.json');
    if (!fs.existsSync(mindmapPath)) {
        console.error('❌ mindmap.json not found at:', mindmapPath);
        process.exit(1);
    }

    const mindmapData = JSON.parse(fs.readFileSync(mindmapPath, 'utf8'));
    console.log(`Found ${mindmapData.length} entries in mindmap.json`);
    
    let updatedCount = 0;
    let notFoundCount = 0;

    for (const item of mindmapData) {
        const _id = item.id; // The id in JSON corresponds to the _id of ImportedCurriculum (which is the chapter name)
        const mindmapValue = item.value; // The actual mindmap tree

        try {
            const mappedDoc = await ImportedCurriculum.updateOne(
                { _id: _id },
                { $set: { "toppersEssentials.mindmap": mindmapValue } }
            );

            if (mappedDoc.matchedCount > 0) {
                updatedCount++;
                console.log(`✅ Updated mindmap for topic: ${_id}`);
            } else {
                notFoundCount++;
                console.log(`⚠️  Topic not found in db: ${_id}`);
            }
        } catch (err) {
            console.error(`❌ Error updating topic: ${_id}`, err.message);
        }
    }
    
    console.log(`\n🎉 Migration completed.`);
    console.log(`✅ Topics updated: ${updatedCount}`);
    console.log(`⚠️  Topics not found: ${notFoundCount}`);
    
    process.exit(0);
}

updateMindmaps().catch(err => {
    console.error(err);
    process.exit(1);
});
