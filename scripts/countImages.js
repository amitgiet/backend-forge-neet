/**
 * countImages.js
 * 
 * Simple counts of images in ImportedQuestions.
 */
require('dotenv').config();
const mongoose = require('mongoose');

// The model path should be fixed depending on script location
const ImportedQuestion = require('../src/models/ImportedQuestion');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const total = await ImportedQuestion.countDocuments({ imageId: { $ne: null } });
    const withUrl = await ImportedQuestion.countDocuments({ imageUrl: { $ne: null } });
    const withExpUrl = await ImportedQuestion.countDocuments({ explanationImageUrl: { $ne: null } });
    
    console.log(`Total questions with imageId: ${total}`);
    console.log(`Questions with imageUrl     : ${withUrl}`);
    console.log(`Questions with ExpImageUrl  : ${withExpUrl}`);
    console.log(`Missing imageUrl            : ${total - withUrl}`);
    
    process.exit(0);
});
