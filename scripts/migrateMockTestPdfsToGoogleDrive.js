require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MockTest = require('../src/models/MockTest');

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_CONCURRENCY = 6;
const MAX_CONCURRENCY = 10;

const PDF_FIELDS = [
    { fieldPath: 'resources.questionPdf', kind: 'question_en', rawMirrorPath: 'source.raw.questionPaperPdfUrl' },
    { fieldPath: 'resources.answerPdf', kind: 'answer_en', rawMirrorPath: 'source.raw.answerKeyPdfUrl' },
    { fieldPath: 'resources.hindiQuestionPdf', kind: 'question_hi', rawMirrorPath: 'source.raw.hindiQuestionPaperPdfUrl' },
    { fieldPath: 'resources.hindiAnswerPdf', kind: 'answer_hi', rawMirrorPath: 'source.raw.hindiAnswerKeyPdfUrl' }
];

const parseArgs = () => {
    const args = process.argv.slice(2);
    const has = (flag) => args.includes(flag);
    const getValue = (flag, fallback) => {
        const idx = args.indexOf(flag);
        if (idx === -1 || idx + 1 >= args.length) return fallback;
        return args[idx + 1];
    };

    const limit = Number(getValue('--limit', 0));
    const timeoutMs = Number(getValue('--timeout-ms', DEFAULT_TIMEOUT_MS));
    const concurrency = Number(getValue('--concurrency', DEFAULT_CONCURRENCY));

    const parsedConcurrency = Number.isFinite(concurrency) && concurrency > 0
        ? Math.floor(concurrency)
        : DEFAULT_CONCURRENCY;

    return {
        dryRun: has('--dry-run'),
        force: has('--force'),
        limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0,
        timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.floor(timeoutMs) : DEFAULT_TIMEOUT_MS,
        concurrency: Math.min(MAX_CONCURRENCY, parsedConcurrency)
    };
};

const getValueByPath = (obj, dottedPath) =>
    dottedPath.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);

const setValueByPath = (target, dottedPath, value) => {
    const keys = dottedPath.split('.');
    let ptr = target;
    for (let i = 0; i < keys.length - 1; i += 1) {
        const key = keys[i];
        if (!ptr[key] || typeof ptr[key] !== 'object') ptr[key] = {};
        ptr = ptr[key];
    }
    ptr[keys[keys.length - 1]] = value;
};

const sanitizeFilePart = (value, fallback = 'unknown') =>
    String(value || fallback)
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 90) || fallback;

const isGoogleDriveUrl = (urlValue = '') => {
    const url = String(urlValue || '').toLowerCase();
    return url.includes('drive.google.com') || url.includes('googleusercontent.com');
};

const withTimeout = async (promise, timeoutMs, message) => {
    let timer = null;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(message || 'Request timed out')), timeoutMs);
            })
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
};

const ensureAccessToken = async () => {
    const direct = String(process.env.GOOGLE_DRIVE_ACCESS_TOKEN || '').trim();
    if (direct) return direct;

    const refreshToken = String(process.env.GOOGLE_DRIVE_REFRESH_TOKEN || '').trim();
    const clientId = String(process.env.GOOGLE_DRIVE_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.GOOGLE_DRIVE_CLIENT_SECRET || '').trim();

    if (!refreshToken || !clientId || !clientSecret) {
        throw new Error(
            'Missing Google auth env. Provide GOOGLE_DRIVE_ACCESS_TOKEN, or GOOGLE_DRIVE_REFRESH_TOKEN + GOOGLE_DRIVE_CLIENT_ID + GOOGLE_DRIVE_CLIENT_SECRET'
        );
    }

    const payload = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload
    });
    const data = await response.json();
    if (!response.ok || !data.access_token) {
        throw new Error(`Failed to refresh Google token: ${JSON.stringify(data)}`);
    }
    return data.access_token;
};

const downloadPdf = async (url, timeoutMs) => {
    const response = await withTimeout(
        fetch(url, {
            headers: { 'User-Agent': 'NEETForge-MockPdf-Migrator/1.0' },
            redirect: 'follow'
        }),
        timeoutMs,
        `Timed out while downloading source PDF: ${url}`
    );

    if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
    }

    const contentType = String(response.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
        throw new Error('Downloaded empty PDF');
    }

    return { buffer, contentType };
};

const uploadToDrive = async ({ fileName, buffer, contentType, folderId, accessToken, timeoutMs }) => {
    const boundary = `----neetforgePdfBoundary${Date.now()}${Math.floor(Math.random() * 10000)}`;
    const metadata = { name: fileName, parents: [folderId] };

    const head = Buffer.from(
        `--${boundary}\r\n` +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${contentType || 'application/pdf'}\r\n\r\n`
    );
    const tail = Buffer.from(`\r\n--${boundary}--`);
    const body = Buffer.concat([head, buffer, tail]);

    const response = await withTimeout(
        fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body
        }),
        timeoutMs,
        `Timed out while uploading PDF to Drive: ${fileName}`
    );

    const data = await response.json();
    if (!response.ok || !data.id) {
        throw new Error(`Drive upload failed: ${JSON.stringify(data)}`);
    }
    return data;
};

const makeDriveFilePublic = async ({ fileId, accessToken, timeoutMs }) => {
    const response = await withTimeout(
        fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role: 'reader', type: 'anyone' })
        }),
        timeoutMs,
        `Timed out while setting Drive file public: ${fileId}`
    );

    if (!response.ok) {
        const data = await response.text();
        throw new Error(`Failed to set public permission: ${data}`);
    }
};

const buildPublicPdfUrl = (fileId) => `https://drive.google.com/uc?export=view&id=${fileId}`;

const ensureLogDir = () => {
    const dir = path.join(__dirname, 'logs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
};

const createLimiter = (concurrency) => {
    let active = 0;
    const queue = [];
    const next = () => {
        if (!queue.length || active >= concurrency) return;
        active += 1;
        const { fn, resolve, reject } = queue.shift();
        Promise.resolve()
            .then(fn)
            .then((result) => {
                active -= 1;
                resolve(result);
                next();
            })
            .catch((error) => {
                active -= 1;
                reject(error);
                next();
            });
    };
    return (fn) => new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject });
        next();
    });
};

const run = async () => {
    const { dryRun, force, limit, timeoutMs, concurrency } = parseArgs();

    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing');
    }
    const folderId = String(process.env.GOOGLE_DRIVE_MOCK_PDF_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
    if (!folderId) {
        throw new Error('GOOGLE_DRIVE_MOCK_PDF_FOLDER_ID (or GOOGLE_DRIVE_FOLDER_ID) is required');
    }

    const accessToken = await ensureAccessToken();
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`Connected to MongoDB. dryRun=${dryRun}, force=${force}, limit=${limit || 'all'}, concurrency=${concurrency}`);

    const query = {
        $or: PDF_FIELDS.map((f) => ({ [f.fieldPath]: { $exists: true, $ne: '' } }))
    };
    const tests = await MockTest.find(query).sort({ _id: 1 }).lean();

    const jobs = [];
    for (const test of tests) {
        for (const def of PDF_FIELDS) {
            const oldUrl = String(getValueByPath(test, def.fieldPath) || '').trim();
            if (!oldUrl) continue;
            if (!force && isGoogleDriveUrl(oldUrl)) continue;

            const rawMirrorValue = String(getValueByPath(test, def.rawMirrorPath) || '').trim();
            const shouldUpdateRawMirror = rawMirrorValue && rawMirrorValue === oldUrl;

            jobs.push({
                testObjectId: String(test._id),
                testId: String(test.testId || ''),
                title: String(test.title?.en || test.title?.hi || ''),
                fieldPath: def.fieldPath,
                kind: def.kind,
                rawMirrorPath: shouldUpdateRawMirror ? def.rawMirrorPath : null,
                oldUrl
            });
        }
    }

    const selectedJobs = limit > 0 ? jobs.slice(0, limit) : jobs;

    const logDir = ensureLogDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const uploadLogPath = path.join(logDir, `mock-pdf-upload-map-${stamp}.jsonl`);
    const fileMapLogPath = path.join(logDir, `mock-pdf-field-map-${stamp}.jsonl`);
    const errorLogPath = path.join(logDir, `mock-pdf-errors-${stamp}.jsonl`);

    // Deduplicate uploads by source URL
    const uploadPromiseBySourceUrl = new Map();
    const limiter = createLimiter(concurrency);

    const getOrCreateUploadPromise = (sourceUrl, sampleJob) => {
        if (uploadPromiseBySourceUrl.has(sourceUrl)) {
            return uploadPromiseBySourceUrl.get(sourceUrl);
        }

        const uploadPromise = limiter(async () => {
            const { buffer, contentType } = await downloadPdf(sourceUrl, timeoutMs);
            const fileName = [
                sanitizeFilePart(sampleJob.testId || 'mock'),
                sanitizeFilePart(sampleJob.kind || 'pdf'),
                `${sanitizeFilePart(sampleJob.testObjectId)}.pdf`
            ].join(' - ');

            const uploaded = await uploadToDrive({
                fileName,
                buffer,
                contentType: contentType || 'application/pdf',
                folderId,
                accessToken,
                timeoutMs
            });

            await makeDriveFilePublic({
                fileId: uploaded.id,
                accessToken,
                timeoutMs
            });

            const newUrl = buildPublicPdfUrl(uploaded.id);
            fs.appendFileSync(uploadLogPath, `${JSON.stringify({
                sourceUrl,
                driveFileId: uploaded.id,
                newUrl
            })}\n`);

            return { sourceUrl, driveFileId: uploaded.id, newUrl };
        });

        uploadPromiseBySourceUrl.set(sourceUrl, uploadPromise);
        return uploadPromise;
    };

    let processed = 0;
    let uploadedUnique = 0;
    let mappedFields = 0;
    let failed = 0;

    const updatesByTestId = new Map();

    const workerPromises = selectedJobs.map(async (job) => {
        processed += 1;
        try {
            const uploadResult = await getOrCreateUploadPromise(job.oldUrl, job);
            if (uploadResult && uploadResult.sourceUrl === job.oldUrl) {
                mappedFields += 1;
            }

            const testPatch = updatesByTestId.get(job.testObjectId) || {};
            testPatch[job.fieldPath] = uploadResult.newUrl;
            if (job.rawMirrorPath) {
                testPatch[job.rawMirrorPath] = uploadResult.newUrl;
            }
            updatesByTestId.set(job.testObjectId, testPatch);

            fs.appendFileSync(fileMapLogPath, `${JSON.stringify({
                testObjectId: job.testObjectId,
                testId: job.testId,
                fieldPath: job.fieldPath,
                rawMirrorPath: job.rawMirrorPath,
                oldUrl: job.oldUrl,
                newUrl: uploadResult.newUrl
            })}\n`);
        } catch (error) {
            failed += 1;
            fs.appendFileSync(errorLogPath, `${JSON.stringify({
                testObjectId: job.testObjectId,
                testId: job.testId,
                fieldPath: job.fieldPath,
                oldUrl: job.oldUrl,
                error: error.message
            })}\n`);
        }
    });

    await Promise.all(workerPromises);
    uploadedUnique = uploadPromiseBySourceUrl.size;

    let matchedCount = 0;
    let modifiedCount = 0;
    if (!dryRun && updatesByTestId.size > 0) {
        const bulkOps = [];
        for (const [testObjectId, patch] of updatesByTestId.entries()) {
            bulkOps.push({
                updateOne: {
                    filter: { _id: new mongoose.Types.ObjectId(testObjectId) },
                    update: { $set: patch }
                }
            });
        }

        if (bulkOps.length) {
            const result = await MockTest.bulkWrite(bulkOps, { ordered: false });
            matchedCount = Number(result.matchedCount || 0);
            modifiedCount = Number(result.modifiedCount || 0);
        }
    }

    console.log('--- Mock PDF migration summary ---');
    console.log({
        totalTestsScanned: tests.length,
        totalFieldJobs: jobs.length,
        queuedJobs: selectedJobs.length,
        processed,
        uploadedUnique,
        mappedFields,
        failed,
        testsToUpdate: updatesByTestId.size,
        matchedCount,
        modifiedCount,
        dryRun,
        uploadLogPath,
        fileMapLogPath,
        errorLogPath
    });

    await mongoose.disconnect();
};

run().catch(async (error) => {
    console.error('Migration failed:', error.message);
    try {
        await mongoose.disconnect();
    } catch (e) { }
    process.exit(1);
});
