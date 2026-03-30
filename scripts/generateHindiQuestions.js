require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ImportedQuestion = require('../src/models/ImportedQuestion');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_CONCURRENCY = 25;
const DEFAULT_BATCH_LIMIT = 5000;
const DEFAULT_RETRY_COUNT = 3;
const LOG_DIR = path.join(__dirname, 'logs');

const parseArgs = () => {
    const args = process.argv.slice(2);
    const has = (flag) => args.includes(flag);
    const getValue = (flag, fallback) => {
        const inline = args.find((arg) => arg.startsWith(`${flag}=`));
        if (inline) return inline.slice(flag.length + 1);

        const idx = args.indexOf(flag);
        if (idx === -1 || idx + 1 >= args.length) return fallback;
        return args[idx + 1];
    };

    const limit = Number(getValue('--limit', DEFAULT_BATCH_LIMIT));
    const concurrency = Number(getValue('--concurrency', DEFAULT_CONCURRENCY));
    const retries = Number(getValue('--retries', DEFAULT_RETRY_COUNT));

    return {
        dryRun: has('--dry-run'),
        apply: has('--apply'),
        logFile: String(getValue('--log-file', '') || '').trim(),
        subject: String(getValue('--subject', '') || '').trim().toLowerCase(),
        chapterId: String(getValue('--chapter-id', '') || '').trim(),
        source: String(getValue('--source', '') || '').trim(),
        model: String(getValue('--model', DEFAULT_MODEL) || DEFAULT_MODEL).trim(),
        limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_BATCH_LIMIT,
        concurrency: Number.isFinite(concurrency) && concurrency > 0 ? Math.floor(concurrency) : DEFAULT_CONCURRENCY,
        retries: Number.isFinite(retries) && retries > 0 ? Math.floor(retries) : DEFAULT_RETRY_COUNT
    };
};

const ensureLogDir = () => {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
};

const appendJsonLine = (filePath, payload) => {
    fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`);
};

const cleanGeminiJson = (text) =>
    String(text || '')
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();

const buildTranslationPrompt = (doc) => {
    const input = {
        question: doc.question || '',
        options: {
            A: doc.options?.A || '',
            B: doc.options?.B || '',
            C: doc.options?.C || '',
            D: doc.options?.D || ''
        },
        explanation: doc.explanation || ''
    };

    return `Translate the following NEET/JEE question content from English to Hindi.

Rules:
- Preserve all mathematical equations, chemical formulae, symbols, units, variable names, and option labels exactly.
- Do not add explanations, comments, markdown, or code fences.
- If a field is empty in English, keep it empty in Hindi.
- Return ONLY valid JSON with this exact structure:
{
  "questionHi": "translated question",
  "optionsHi": {
    "A": "translated option A",
    "B": "translated option B",
    "C": "translated option C",
    "D": "translated option D"
  },
  "explanationHi": "translated explanation"
}

English Input:
${JSON.stringify(input)}`;
};

const translateQuestion = async (doc, model) => {
    const prompt = buildTranslationPrompt(doc);

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: 'application/json'
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textOutput) {
        throw new Error('Empty response from Gemini');
    }

    const parsed = JSON.parse(cleanGeminiJson(textOutput));
    return {
        questionHi: String(parsed?.questionHi || '').trim() || null,
        optionsHi: {
            A: String(parsed?.optionsHi?.A || '').trim() || null,
            B: String(parsed?.optionsHi?.B || '').trim() || null,
            C: String(parsed?.optionsHi?.C || '').trim() || null,
            D: String(parsed?.optionsHi?.D || '').trim() || null
        },
        explanationHi: String(parsed?.explanationHi || '').trim() || null
    };
};

const needsHindiTranslation = (doc) => {
    const hasEnglishQuestion = String(doc.question || '').trim().length > 0;
    if (!hasEnglishQuestion) return false;

    const hasQuestionHi = String(doc.questionHi || '').trim().length > 0;
    const hasAnyOptionHi = ['A', 'B', 'C', 'D'].some((key) => String(doc.optionsHi?.[key] || '').trim().length > 0);
    const hasExplanationHi = String(doc.explanationHi || '').trim().length > 0;

    return !(hasQuestionHi && hasAnyOptionHi && (String(doc.explanation || '').trim() ? hasExplanationHi : true));
};

const buildQuery = ({ subject, chapterId, source }) => {
    const query = {
        language: 'en',
        isActive: true,
        isSupported: true,
        question: { $exists: true, $nin: [null, ''] }
    };

    if (subject) query.subject = subject;
    if (chapterId) query.chapterId = chapterId;
    if (source) query.source = source;

    return query;
};

const runWithConcurrency = async (items, concurrency, worker) => {
    const results = new Array(items.length);
    let cursor = 0;

    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (true) {
            const index = cursor;
            cursor += 1;
            if (index >= items.length) return;
            results[index] = await worker(items[index], index);
        }
    });

    await Promise.all(runners);
    return results;
};

const applyLogFile = async (logFilePath) => {
    if (!logFilePath) throw new Error('Missing --log-file for --apply');
    if (!fs.existsSync(logFilePath)) throw new Error(`Log file not found: ${logFilePath}`);

    const lines = fs.readFileSync(logFilePath, 'utf8').split('\n').filter(Boolean);
    const updates = lines.map((line) => JSON.parse(line));
    let updatedCount = 0;

    for (let i = 0; i < updates.length; i += 500) {
        const chunk = updates.slice(i, i + 500);
        const bulkOps = chunk.map((data) => ({
            updateOne: {
                filter: { _id: data._id, language: 'en' },
                update: {
                    $set: {
                        questionHi: data.questionHi,
                        optionsHi: data.optionsHi,
                        explanationHi: data.explanationHi
                    }
                }
            }
        }));

        if (bulkOps.length > 0) {
            await ImportedQuestion.bulkWrite(bulkOps);
            updatedCount += bulkOps.length;
        }
    }

    console.log(`Applied Hindi translations from ${logFilePath}. Updated ${updatedCount} English documents.`);
};

const run = async () => {
    const {
        dryRun,
        apply,
        logFile,
        subject,
        chapterId,
        source,
        model,
        limit,
        concurrency,
        retries
    } = parseArgs();

    try {
        if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set in .env');
        if (!GEMINI_API_KEY && !apply) throw new Error('GEMINI_API_KEY is not set in .env');

        ensureLogDir();
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB.');

        if (apply) {
            await applyLogFile(logFile);
            return;
        }

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputFile = path.join(LOG_DIR, `hindi-translations-${stamp}.jsonl`);
        const errorFile = path.join(LOG_DIR, `hindi-translation-errors-${stamp}.jsonl`);
        const dryRunFile = path.join(LOG_DIR, `hindi-test-${stamp}.json`);

        const baseQuery = buildQuery({ subject, chapterId, source });
        const totalCandidates = await ImportedQuestion.countDocuments(baseQuery);
        console.log(`Found ${totalCandidates} English candidate docs.`);

        const docs = await ImportedQuestion.find(baseQuery).sort({ _id: 1 }).limit(limit).lean();
        const queue = docs.filter(needsHindiTranslation);

        console.log(`This run will process ${queue.length} English docs needing Hindi fields. model=${model}, concurrency=${concurrency}, dryRun=${dryRun}`);

        if (!queue.length) {
            console.log('Everything matching this filter already has Hindi content.');
            return;
        }

        let processedCount = 0;
        let successCount = 0;
        let errorCount = 0;
        const dryRunResults = [];

        await runWithConcurrency(queue, concurrency, async (doc) => {
            let translated = null;
            let lastError = null;

            for (let attempt = 1; attempt <= retries; attempt += 1) {
                try {
                    translated = await translateQuestion(doc, model);
                    lastError = null;
                    break;
                } catch (error) {
                    lastError = error;
                    const isRateLimit = /429|quota|rate/i.test(String(error.message || ''));
                    if (attempt < retries) {
                        const waitMs = isRateLimit ? 2500 * attempt : 1000 * attempt;
                        await new Promise((resolve) => setTimeout(resolve, waitMs));
                    }
                }
            }

            if (translated) {
                const payload = {
                    _id: String(doc._id),
                    questionId: doc.questionId,
                    subject: doc.subject || null,
                    chapterId: doc.chapterId || null,
                    language: doc.language,
                    questionHi: translated.questionHi,
                    optionsHi: translated.optionsHi,
                    explanationHi: translated.explanationHi
                };

                if (dryRun) {
                    dryRunResults.push({
                        _id: doc._id,
                        questionId: doc.questionId,
                        originalQuestion: doc.question,
                        translatedQuestion: translated.questionHi,
                        originalOptions: doc.options,
                        translatedOptions: translated.optionsHi,
                        originalExplanation: doc.explanation,
                        translatedExplanation: translated.explanationHi
                    });
                } else {
                    appendJsonLine(outputFile, payload);
                }

                successCount += 1;
            } else {
                errorCount += 1;
                appendJsonLine(errorFile, {
                    _id: String(doc._id),
                    questionId: doc.questionId,
                    subject: doc.subject || null,
                    chapterId: doc.chapterId || null,
                    error: lastError ? String(lastError.message || lastError) : 'Unknown translation error'
                });
            }

            processedCount += 1;
            if (processedCount % 25 === 0 || processedCount === queue.length) {
                console.log(`Processed ${processedCount}/${queue.length} | Success: ${successCount} | Failed: ${errorCount}`);
            }
        });

        if (dryRun) {
            fs.writeFileSync(dryRunFile, JSON.stringify(dryRunResults, null, 2));
            console.log(`Dry run complete. Preview saved to ${dryRunFile}`);
            return;
        }

        console.log(`Translations logged to ${outputFile}`);
        console.log(`Error log: ${errorFile}`);

        await applyLogFile(outputFile);
    } catch (err) {
        console.error('Critical error:', err);
        process.exitCode = 1;
    } finally {
        try {
            await mongoose.disconnect();
        } catch (_) { }
    }
};

run();
