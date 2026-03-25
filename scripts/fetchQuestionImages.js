/**
 * fetchQuestionImages.js
 *
 * For every unique imageId in ImportedQuestion:
 *  1. Pick one questionId (uid) that has that imageId.
 *  2. Call MemoNeet API: { subject, uid }.
 *  3. Process response: question[] and explanation[] arrays of URLs.
 *  4. Download and upload to Drive.
 *  5. Mark imageUrl and explanationImageUrl for all questions sharing that imageId.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ImportedQuestion = require('../src/models/ImportedQuestion');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const MEMONEET_API = 'https://memoneet.xyz/api/get-question-images';
const CONCURRENCY = 10;
const TIMEOUT_MS = 30_000;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const APPLY = args.includes('--apply');
const concurrency = +(args[args.indexOf('--concurrency') + 1] || CONCURRENCY);

const ensureLogDir = () => {
    const dir = path.join(__dirname, 'logs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
};

const getAccessToken = async () => {
    const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;

    if (refreshToken && clientId && clientSecret) {
        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            })
        });
        const data = await res.json();
        if (res.ok && data.access_token) return data.access_token;
    }
    const direct = process.env.GOOGLE_DRIVE_ACCESS_TOKEN || process.env.AC;
    if (direct) return direct;
    throw new Error('Google Drive credentials missing.');
};

const uploadToDrive = async ({ fileName, buffer, contentType, folderId, accessToken }) => {
    const boundary = `----neetforgeBoundary${Date.now()}`;
    const metadata = { name: fileName, parents: [folderId] };
    const head = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`
    );
    const tail = Buffer.from(`\r\n--${boundary}--`);
    const body = Buffer.concat([head, buffer, tail]);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Drive upload failed: ${JSON.stringify(data)}`);
    return data.id;
};

const makePublic = (fileId, accessToken) => fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
});

const driveUrl = (fId) => `https://drive.google.com/uc?export=view&id=${fId}`;

const downloadImage = async (url) => {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = (res.headers.get('content-type') || 'image/png').split(';')[0].trim();
    return { buffer, contentType };
};

const main = async () => {
    const folderId = process.env.GOOGLE_DRIVE_IMAGES_FOLDER_ID;
    if (!folderId && !DRY_RUN) throw new Error('GOOGLE_DRIVE_IMAGES_FOLDER_ID is missing.');

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    // 1. Find all questions that have an imageId and NO imageUrl
    const questions = await ImportedQuestion.find(
        { 
            imageId: { $exists: true, $nin: [null, '', 'null', 'undefined'] },
            imageUrl: null 
        },
        { _id: 1, questionId: 1, imageId: 1, subject: 1 }
    ).lean();

    // 2. Group by imageId to pick one uid per image
    const imageToUidMap = {}; // imageId -> { subject, uid, questionId }
    for (const q of questions) {
        if (!imageToUidMap[q.imageId]) {
            imageToUidMap[q.imageId] = { subject: q.subject, uid: q.questionId };
        }
    }

    const uniqueImageIds = Object.keys(imageToUidMap);
    console.log(`Total questions missing images : ${questions.length}`);
    console.log(`Unique imageIds to fetch       : ${uniqueImageIds.length}`);
    console.log(`Dry run                       : ${DRY_RUN}\n`);

    const logDir = ensureLogDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = path.join(logDir, `q-images-${stamp}.jsonl`);
    const errPath = path.join(logDir, `q-images-errors-${stamp}.jsonl`);

    let accessToken = null;
    if (!DRY_RUN) {
        accessToken = await getAccessToken();
        console.log('Got Drive access token.\n');
    }

    let success = 0, failed = 0, noData = 0;
    const bulkUpdates = [];

    const queue = uniqueImageIds;
    let cursor = 0;

    const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (cursor < queue.length) {
            const imageId = queue[cursor++];
            const { subject, uid } = imageToUidMap[imageId];

            try {
                const apiRes = await fetch(MEMONEET_API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'User-Agent': 'NEETForge/1.0' },
                    body: JSON.stringify({ subject, uid })
                });

                if (!apiRes.ok) throw new Error(`API returned ${apiRes.status}`);
                const data = await apiRes.json();

                const qImgUrls = Array.isArray(data.question) ? data.question : [];
                const eImgUrls = Array.isArray(data.explanation) ? data.explanation : [];

                if (qImgUrls.length === 0 && eImgUrls.length === 0) {
                    noData++;
                    fs.appendFileSync(errPath, JSON.stringify({ imageId, uid, error: 'No images found in API response' }) + '\n');
                    continue;
                }

                let finalImageUrl = null;
                let finalExpUrl = null;

                // Process Question Image
                if (qImgUrls[0] && !DRY_RUN) {
                    const { buffer, contentType } = await downloadImage(qImgUrls[0]);
                    const fid = await uploadToDrive({ 
                        fileName: `q-${imageId}.png`, buffer, contentType, folderId, accessToken 
                    });
                    await makePublic(fid, accessToken);
                    finalImageUrl = driveUrl(fid);
                }

                // Process Explanation Image
                if (eImgUrls[0] && !DRY_RUN) {
                    const { buffer, contentType } = await downloadImage(eImgUrls[0]);
                    const fid = await uploadToDrive({ 
                        fileName: `exp-${imageId}.png`, buffer, contentType, folderId, accessToken 
                    });
                    await makePublic(fid, accessToken);
                    finalExpUrl = driveUrl(fid);
                }

                bulkUpdates.push({ imageId, imageUrl: finalImageUrl, explanationImageUrl: finalExpUrl });
                fs.appendFileSync(logPath, JSON.stringify({ imageId, uid, imageUrl: finalImageUrl, explanationImageUrl: finalExpUrl }) + '\n');
                success++;

                if (success % 10 === 0) console.log(`[${success}/${uniqueImageIds.length}] Downloaded imageId=${imageId}`);
            } catch (err) {
                failed++;
                fs.appendFileSync(errPath, JSON.stringify({ imageId, uid, error: err.message }) + '\n');
                console.error(`  ✗ fail: imageId=${imageId} uid=${uid} - ${err.message}`);
            }
        }
    });

    await Promise.all(runners);

    console.log(`\n✅ Summary: Success=${success}, Failed=${failed}, NoDataInAPI=${noData}`);

    if (!DRY_RUN && APPLY && bulkUpdates.length > 0) {
        console.log(`\nApplying updates to MongoDB...`);
        const ops = bulkUpdates.map(u => ({
            updateMany: {
                filter: { imageId: u.imageId },
                update: { $set: { imageUrl: u.imageUrl, explanationImageUrl: u.explanationImageUrl } }
            }
        }));

        const chunk = 100;
        for (let i = 0; i < ops.length; i += chunk) {
            await ImportedQuestion.bulkWrite(ops.slice(i, i + chunk));
            console.log(`  Updated ${Math.min(i + chunk, ops.length)}/${ops.length} imageIds...`);
        }
        console.log('✅ DB update complete.');
    } else if (!DRY_RUN) {
        console.log('\nUpdates NOT applied to DB. Use --apply to save changes.');
    }

    await mongoose.disconnect();
};

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
