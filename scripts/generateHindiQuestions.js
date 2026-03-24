require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const ImportedQuestion = require('../src/models/ImportedQuestion');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash';
const CONCURRENCY = 150;

const DRY_RUN = false; // Set to false to actually update the DB
const BATCH_LIMIT = 5000; // Only run 5,000 at a time
const LOG_DIR = path.join(__dirname, 'logs');

async function translateQuestion(doc) {
    const input = {
        question: doc.question || '',
        options: {
            A: doc.options?.A || '',
            B: doc.options?.B || '',
            C: doc.options?.C || '',
            D: doc.options?.D || '',
        },
        explanation: doc.explanation || ''
    };

    const prompt = `Translate the following NEET/JEE exam question, options, and explanation from English to Hindi. 
Preserve all mathematical equations, LaTeX, symbols, and formatting exactly as they are. 
Return ONLY valid JSON with this exact structure, no markdown, no other text:
{
    "questionHi": "translated question",
    "optionsHi": {
        "A": "translated option A",
        "B": "translated option B",
        "C": "translated option C",
        "D": "translated option D"
    },
    "explanationHi": "translated explanation or empty if none"
}

English Input:
${JSON.stringify(input)}
`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const textOuput = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textOuput) throw new Error("Empty response from Gemini");

    return JSON.parse(textOuput);
}

const run = async () => {
    try {
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set in .env");

        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB.");

        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
        }
        const OUTPUT_FILE = path.join(LOG_DIR, `hindi-translations-${Date.now()}.jsonl`);

        const query = {
            questionHi: { $exists: false },
            question: { $exists: true, $ne: null, $ne: '' }
        };

        const totalRemaining = await ImportedQuestion.countDocuments(query);
        console.log(`Found ${totalRemaining} total questions left in the database.`);

        if (totalRemaining === 0) {
            console.log("Everything is fully translated and up to date!");
            process.exit(0);
        }

        const totalToProcess = DRY_RUN ? 5 : Math.min(totalRemaining, BATCH_LIMIT);
        console.log(`This script run will only process: ${totalToProcess} questions.`);

        const cursor = ImportedQuestion.find(query).limit(totalToProcess).cursor();

        let processedCount = 0;
        let successCount = 0;
        let errorCount = 0;
        const activePromises = new Set();
        let dryRunResults = [];

        for await (const doc of cursor) {
            const p = (async () => {
                let attempts = 0;
                let success = false;
                let translated = null;

                while (attempts < 3 && !success) {
                    try {
                        translated = await translateQuestion(doc);
                        success = true;
                    } catch (e) {
                        attempts++;
                        if (e.message.includes('429')) {
                            // Rate limit hit: wait exponentially
                            await new Promise(r => setTimeout(r, 2000 * attempts));
                        } else if (attempts >= 3) {
                            console.error(`Failed ID ${doc._id} after 3 attempts:`, e.message);
                        }
                    }
                }

                if (success && translated) {
                    if (DRY_RUN) {
                        dryRunResults.push({
                            _id: doc._id,
                            originalQuestion: doc.question,
                            translatedQuestion: translated.questionHi,
                            originalOptions: doc.options,
                            translatedOptions: translated.optionsHi,
                            originalExplanation: doc.explanation,
                            translatedExplanation: translated.explanationHi
                        });
                        console.log(`[DRY RUN] Received translation for: ${doc._id}`);
                    } else {
                        const line = JSON.stringify({
                            _id: doc._id,
                            questionHi: translated.questionHi || null,
                            optionsHi: {
                                A: translated.optionsHi?.A || null,
                                B: translated.optionsHi?.B || null,
                                C: translated.optionsHi?.C || null,
                                D: translated.optionsHi?.D || null,
                            },
                            explanationHi: translated.explanationHi || null
                        });
                        fs.appendFileSync(OUTPUT_FILE, line + '\n');
                    }
                    successCount++;
                } else {
                    errorCount++;
                }
            })();
            
            p.finally(() => activePromises.delete(p));
            activePromises.add(p);
            processedCount++;

            // Keeps exactly CONCURRENCY requests running continuously
            if (activePromises.size >= CONCURRENCY) {
                await Promise.race(activePromises);
            }

            if (processedCount % 30 === 0) {
                console.log(`Queued: ${processedCount}/${totalToProcess} | Active Requests: ${activePromises.size} | Success: ${successCount} | Failed: ${errorCount}`);
            }
        }
        
        // Drain any remaining active promises
        if (activePromises.size > 0) {
            await Promise.all(activePromises);
        }
        console.log(`\nFinal Stats. Processed: ${processedCount}/${totalToProcess} | Success: ${successCount} | Failed: ${errorCount}`);

        if (DRY_RUN) {
            const logFile = path.join(LOG_DIR, `hindi-test-${Date.now()}.json`);
            fs.writeFileSync(logFile, JSON.stringify(dryRunResults, null, 2));
            console.log(`\n✅ DRY RUN complete! Results saved to ${logFile}`);
        } else {
            console.log(`\n🚀 All translations complete! Starting bulk database update from log file...`);
            if (fs.existsSync(OUTPUT_FILE)) {
                const fileStream = fs.createReadStream(OUTPUT_FILE);
                const rl = require('readline').createInterface({ input: fileStream, crlfDelay: Infinity });

                let bulkOps = [];
                let updatedCount = 0;

                for await (const line of rl) {
                    if (!line) continue;
                    const data = JSON.parse(line);
                    
                    bulkOps.push({
                        updateOne: {
                            filter: { _id: data._id },
                            update: { 
                                $set: {
                                    questionHi: data.questionHi,
                                    optionsHi: data.optionsHi,
                                    explanationHi: data.explanationHi
                                }
                            }
                        }
                    });

                    // Flush batch every 500 documents
                    if (bulkOps.length >= 500) {
                        await ImportedQuestion.bulkWrite(bulkOps);
                        updatedCount += bulkOps.length;
                        bulkOps = [];
                        console.log(`Updated ${updatedCount} documents in DB so far...`);
                    }
                }

                if (bulkOps.length > 0) {
                    await ImportedQuestion.bulkWrite(bulkOps);
                    updatedCount += bulkOps.length;
                }
                console.log(`\n✅ Database bulk update completely finished! Total updated: ${updatedCount}`);
            }
        }
    } catch (err) {
        console.error("Critical error:", err);
    } finally {
        process.exit(0);
    }
};

run();
