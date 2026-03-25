/**
 * retryFailedImages.js
 * 
 * Retries failed IDs by trying all possible subjects AND both Number/String UID formats.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ImportedQuestion = require('../src/models/ImportedQuestion');

const MEMONEET_API = 'https://memoneet.xyz/api/get-question-images';
const SUBJECTS = ['physics', 'chemistry', 'biology'];
const CONCURRENCY = 10;
const ERROR_LOG_FILE = 'scripts/logs/q-images-errors-2026-03-25T09-04-20-083Z.jsonl';

const getAccessToken = async () => {
    const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    if (refreshToken && clientId && clientSecret) {
        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' })
        });
        const data = await res.json();
        if (res.ok && data.access_token) return data.access_token;
    }
    return process.env.GOOGLE_DRIVE_ACCESS_TOKEN || process.env.AC;
};

const uploadToDrive = async ({ fileName, buffer, contentType, folderId, accessToken }) => {
    const boundary = `----neetforgeBoundary${Date.now()}`;
    const metadata = { name: fileName, parents: [folderId] };
    const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`);
    const tail = Buffer.from(`\r\n--${boundary}--`);
    const body = Buffer.concat([head, buffer, tail]);
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body
    });
    const data = await res.json();
    return data.id;
};

const makePublic = (fid, token) => fetch(`https://www.googleapis.com/drive/v3/files/${fid}/permissions`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
});

const driveUrl = (fId) => `https://drive.google.com/uc?export=view&id=${fId}`;

const downloadImage = async (url) => {
    const res = await fetch(url, { redirect: 'follow' });
    const buffer = Buffer.from(await res.arrayBuffer());
    const ct = (res.headers.get('content-type') || 'image/png').split(';')[0].trim();
    return { buffer, contentType: ct };
};

const main = async () => {
    const folderId = process.env.GOOGLE_DRIVE_IMAGES_FOLDER_ID;
    const errorLogPath = path.resolve(ERROR_LOG_FILE);
    await mongoose.connect(process.env.MONGODB_URI);
    const accessToken = await getAccessToken();

    const failedItems = fs.readFileSync(errorLogPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    console.log(`Starting retry for ${failedItems.length} items...`);

    let success = 0;
    const bulkUpdates = [];
    let cursor = 0;

    const runners = Array.from({ length: Math.min(CONCURRENCY, failedItems.length) }, async () => {
        while (cursor < failedItems.length) {
            const { imageId, uid } = failedItems[cursor++];
            let hit = false, imageLink = null, expLink = null;

            // Try all 3 subjects
            for (const s of SUBJECTS) {
                // Try as String AND as Number
                for (const u of [uid, parseInt(uid, 10)]) {
                    if (isNaN(u) && typeof u === 'number') continue;
                    try {
                        const res = await fetch(MEMONEET_API, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ subject: s, uid: u })
                        });
                        if (!res.ok) continue;

                        const data = await res.json();
                        const qUrls = Array.isArray(data.question) ? data.question : [];
                        const eUrls = Array.isArray(data.explanation) ? data.explanation : [];

                        if (qUrls.length > 0 || eUrls.length > 0) {
                            if (qUrls[0]) {
                                const d = await downloadImage(qUrls[0]);
                                const fid = await uploadToDrive({ fileName: `q-${imageId}.png`, buffer: d.buffer, contentType: d.contentType, folderId, accessToken });
                                await makePublic(fid, accessToken);
                                imageLink = driveUrl(fid);
                            }
                            if (eUrls[0]) {
                                const d = await downloadImage(eUrls[0]);
                                const fid = await uploadToDrive({ fileName: `exp-${imageId}.png`, buffer: d.buffer, contentType: d.contentType, folderId, accessToken });
                                await makePublic(fid, accessToken);
                                expLink = driveUrl(fid);
                            }
                            hit = true; break;
                        }
                    } catch (e) { }
                }
                if (hit) break;
            }

            if (hit) {
                success++;
                bulkUpdates.push({ imageId, imageUrl: imageLink, explanationImageUrl: expLink });
                console.log(`✅ [HIT] imageId=${imageId} (Total Recovered: ${success})`);
            }
        }
    });

    await Promise.all(runners);

    if (bulkUpdates.length > 0) {
        console.log(`\nFinalizing DB updates for ${bulkUpdates.length} imageIds...`);
        const ops = bulkUpdates.map(u => ({
            updateMany: { filter: { imageId: u.imageId }, update: { $set: { imageUrl: u.imageUrl, explanationImageUrl: u.explanationImageUrl } } }
        }));
        await ImportedQuestion.bulkWrite(ops);
        console.log('✅ DB Updated Successfully.');
    } else {
        console.log('\nStill no hits found for those specific IDs.');
    }

    await mongoose.disconnect();
};

main().catch(err => { console.error(err); });
