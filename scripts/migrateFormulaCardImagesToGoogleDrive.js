require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const FormulaCard = require('../src/models/FormulaCard');

const DEFAULT_TIMEOUT_MS = 60_000;

const CONTENT_TYPE_TO_EXT = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg'
};

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

    return {
        dryRun: has('--dry-run'),
        force: has('--force'),
        limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0,
        timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.floor(timeoutMs) : DEFAULT_TIMEOUT_MS
    };
};

const sanitizeFilePart = (value, fallback = 'untitled') =>
    String(value || fallback)
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 80) || fallback;

const isGoogleDriveUrl = (urlValue) => {
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

const downloadImage = async (url, timeoutMs) => {
    const response = await withTimeout(
        fetch(url, {
            headers: {
                'User-Agent': 'NEETForge-Formula-Migrator/1.0'
            },
            redirect: 'follow'
        }),
        timeoutMs,
        `Timed out while downloading source image: ${url}`
    );

    if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
    }

    const contentType = String(response.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
        throw new Error('Downloaded empty file');
    }

    return { buffer, contentType };
};

const uploadToDrive = async ({ fileName, buffer, contentType, folderId, accessToken, timeoutMs }) => {
    const boundary = `----neetforgeBoundary${Date.now()}`;
    const metadata = {
        name: fileName,
        parents: [folderId]
    };

    const head = Buffer.from(
        `--${boundary}\r\n` +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`
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
        `Timed out while uploading file to Google Drive: ${fileName}`
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
            body: JSON.stringify({
                role: 'reader',
                type: 'anyone'
            })
        }),
        timeoutMs,
        `Timed out while setting public permission for file: ${fileId}`
    );

    if (!response.ok) {
        const data = await response.text();
        throw new Error(`Failed to set file public: ${data}`);
    }
};

const buildPublicUrl = (fileId) => `https://drive.google.com/uc?export=view&id=${fileId}`;

const ensureLogDir = () => {
    const dir = path.join(__dirname, 'logs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
};

const run = async () => {
    const { dryRun, force, limit, timeoutMs } = parseArgs();

    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing');
    }
    const folderId = String(process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
    if (!folderId) {
        throw new Error('GOOGLE_DRIVE_FOLDER_ID is required');
    }

    const accessToken = await ensureAccessToken();
    console.log(`Access token: ${accessToken}`);

    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`Connected to MongoDB. dryRun=${dryRun}, force=${force}, limit=${limit || 'all'}`);

    const query = {
        imgUrl: { $exists: true, $ne: '' }
    };
    const cards = await FormulaCard.find(query).sort({ _id: 1 }).lean();

    const selected = force ? cards : cards.filter((card) => !isGoogleDriveUrl(card.imgUrl));
    const queue = limit > 0 ? selected.slice(0, limit) : selected;

    const logDir = ensureLogDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const mapLogPath = path.join(logDir, `formula-image-migration-map-${stamp}.jsonl`);
    const errorLogPath = path.join(logDir, `formula-image-migration-errors-${stamp}.jsonl`);

    let processed = 0;
    let updated = 0;
    let skipped = cards.length - queue.length;
    let failed = 0;

    for (const card of queue) {
        processed += 1;
        const oldUrl = String(card.imgUrl || '').trim();

        try {
            const { buffer, contentType } = await downloadImage(oldUrl, timeoutMs);
            const ext = CONTENT_TYPE_TO_EXT[contentType] || 'bin';
            const fileName = [
                sanitizeFilePart(card.subjectTitle, 'subject'),
                sanitizeFilePart(card.chapterTitle, 'chapter'),
                sanitizeFilePart(card.topicTitle, 'topic'),
                sanitizeFilePart(card.title, 'card'),
                `${String(card._id)}.${ext}`
            ].join(' - ');

            const uploaded = await uploadToDrive({
                fileName,
                buffer,
                contentType,
                folderId,
                accessToken,
                timeoutMs
            });

            await makeDriveFilePublic({
                fileId: uploaded.id,
                accessToken,
                timeoutMs
            });

            const newUrl = buildPublicUrl(uploaded.id);

            if (!dryRun) {
                await FormulaCard.updateOne(
                    { _id: card._id },
                    { $set: { imgUrl: newUrl } }
                );
            }

            fs.appendFileSync(
                mapLogPath,
                `${JSON.stringify({
                    cardId: String(card._id),
                    getMarksId: card.getMarksId || null,
                    oldUrl,
                    driveFileId: uploaded.id,
                    newUrl
                })}\n`
            );

            updated += 1;
            if (processed % 25 === 0) {
                console.log(`Processed ${processed}/${queue.length} ...`);
            }
        } catch (error) {
            failed += 1;
            fs.appendFileSync(
                errorLogPath,
                `${JSON.stringify({
                    cardId: String(card._id),
                    oldUrl,
                    error: error.message
                })}\n`
            );
        }
    }

    console.log('--- Formula image migration summary ---');
    console.log({
        totalCards: cards.length,
        queued: queue.length,
        processed,
        updated,
        skipped,
        failed,
        dryRun,
        mapLogPath,
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

