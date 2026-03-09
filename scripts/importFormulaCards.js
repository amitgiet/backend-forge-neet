require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const FormulaSubject = require('../src/models/FormulaSubject');
const FormulaTopic = require('../src/models/FormulaTopic');
const FormulaCard = require('../src/models/FormulaCard');

// Add your GetMarks bearer token here
const GETMARKS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YWJmOTA0ZmZjYjI2ZGYyZTJlNDhhMyIsImlhdCI6MTc3Mjg3ODA4NCwiZXhwIjoxNzc1NDcwMDg0fQ.Olmh1fYDexMDOtzwJ_8aujvKvKjr41NSM4hLM8YDlEM';

const fetchGetMarks = async (url) => {
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${GETMARKS_TOKEN}`,
            'Content-Type': 'application/json'
        }
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function importFormulaCards() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Read the Landing JSON
        const dataPath = path.join(__dirname, '../uploads/formulasubjectdetsils.json');
        if (!fs.existsSync(dataPath)) {
            console.error('Data file not found at:', dataPath);
            return;
        }

        const rawData = fs.readFileSync(dataPath, 'utf-8');
        const landingData = JSON.parse(rawData);

        if (!landingData.success || !landingData.data || !landingData.data.subjects) {
            console.error('Invalid landing data structure');
            return;
        }

        // 2. Iterate Subjects
        for (const subj of landingData.data.subjects) {
            const subjectTitle = subj.title;
            const subjectIcon = subj.icon;
            const subjectPosition = subj.position;

            console.log(`\nProcessing Subject: ${subjectTitle}`);

            // Find or create subject
            let subjectDoc = await FormulaSubject.findOne({ title: subjectTitle });
            if (!subjectDoc) {
                subjectDoc = new FormulaSubject({
                    title: subjectTitle,
                    icon: subjectIcon,
                    position: subjectPosition,
                    chapters: []
                });
            }

            const getMarksSubjectId = subj.subject._id;
            const chaptersArray = subj.subject.chapters || [];

            // 3. Iterate Chapters
            for (const chp of chaptersArray) {
                const chapterTitle = chp.title;
                const getMarksChapterId = chp._id;

                console.log(`  -> Processing Chapter: ${chapterTitle}`);

                // Check if chapter already exists in subjectDoc
                const existingChapter = subjectDoc.chapters.find(c => c.title === chapterTitle);
                if (!existingChapter) {
                    subjectDoc.chapters.push({
                        title: chapterTitle,
                        icon: chp.icon,
                        bgColor: chp.bgColor,
                        color: chp.color,
                        position: chp.position,
                        cardsCount: chp.cardsCount,
                        topicsCount: chp.topicsCount,
                        getMarksChapterId: getMarksChapterId
                    });
                }

                try {
                    // Fetch topics from GetMarks API
                    console.log(`    Fetching topics for ${chapterTitle}...`);
                    const topicUrl = `https://web.getmarks.app/api/v2/fc/subject/${getMarksSubjectId}/chapter/${getMarksChapterId}`;
                    const topicData = await fetchGetMarks(topicUrl);

                    const topics = topicData?.data?.topics || [];

                    // 4. Iterate Topics (skip the 'All Topics' general one if present, or process all real topics)
                    for (const topic of topics) {
                        if (topic._id === 'allTopics') continue;

                        const topicTitle = topic.title;
                        const coverImage = topic.coverImages?.allFormulae || '';

                        // Upsert Topic
                        await FormulaTopic.findOneAndUpdate(
                            { getMarksTopicId: topic._id },
                            {
                                title: topicTitle,
                                chapterTitle: chapterTitle,
                                subjectTitle: subjectTitle,
                                position: topic.position,
                                coverImage: coverImage,
                                cardsCount: topic.cardsCount,
                                getMarksTopicId: topic._id
                            },
                            { upsert: true, new: true }
                        );

                        // 5. Fetch Cards for this Topic
                        console.log(`      Fetching cards for topic [${topicTitle}]...`);
                        const cardsUrl = `https://web.getmarks.app/api/v2/fc/subject/${getMarksSubjectId}/chapter/${getMarksChapterId}/topic/${topic._id}/category?category=allFormulae`;

                        // Sleep to avoid rate limits
                        await sleep(1000);

                        try {
                            const cardsData = await fetchGetMarks(cardsUrl);
                            const cards = cardsData?.data?.cards || [];

                            // Upsert Cards
                            for (const card of cards) {
                                await FormulaCard.findOneAndUpdate(
                                    { getMarksId: card._id },
                                    {
                                        title: card.title,
                                        imgUrl: card.imgUrl,
                                        subjectTitle: subjectTitle,
                                        chapterTitle: chapterTitle,
                                        topicTitle: topicTitle,
                                        position: card.position,
                                        getMarksId: card._id
                                    },
                                    { upsert: true }
                                );
                            }
                            console.log(`      Saved ${cards.length} cards for [${topicTitle}]`);
                        } catch (cardErr) {
                            console.error(`      Failed to fetch cards for topic [${topicTitle}]: ${cardErr.message}`);
                        }
                    }
                } catch (topicErr) {
                    console.error(`    Failed to fetch topics for chapter [${chapterTitle}]: ${topicErr.message}`);
                }

                await subjectDoc.save();
                // Sleep between chapters
                await sleep(1000);
            }
        }

        console.log('\n✅ Import completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Fatal import error:', error);
        process.exit(1);
    }
}

importFormulaCards();
