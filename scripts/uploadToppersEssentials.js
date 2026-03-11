require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ImportedCurriculum = require('../src/models/ImportedCurriculum');

const FOLDER_PATH = path.join(__dirname, '../uploads/Topperessentials');
const DEFAULT_TIMEOUT_MS = 120_000;

// Chapters to SKIP (keep their existing data untouched)
const SKIP_CHAPTERS = ['GENETICS AND EVOLUTION'];

// Reused Google Drive Auth helper
const ensureAccessToken = async () => {
    const direct = String(process.env.GOOGLE_DRIVE_ACCESS_TOKEN || '').trim();
    if (direct) return direct;

    const refreshToken = String(process.env.GOOGLE_DRIVE_REFRESH_TOKEN || '').trim();
    const clientId = String(process.env.GOOGLE_DRIVE_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.GOOGLE_DRIVE_CLIENT_SECRET || '').trim();

    if (!refreshToken || !clientId || !clientSecret) {
        throw new Error('Missing Google auth env. Provide GOOGLE_DRIVE_ACCESS_TOKEN, or GOOGLE_DRIVE_REFRESH_TOKEN + GOOGLE_DRIVE_CLIENT_ID + GOOGLE_DRIVE_CLIENT_SECRET');
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

const createFolder = async (folderName, parentFolderId, accessToken, timeoutMs) => {
    const response = await withTimeout(
        fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentFolderId]
            })
        }),
        timeoutMs,
        `Timed out creating folder: ${folderName}`
    );

    const data = await response.json();
    if (!response.ok || !data.id) {
        throw new Error(`Folder creation failed: ${JSON.stringify(data)}`);
    }
    return data;
};

const uploadFile = async (filePath, fileName, parentFolderId, accessToken, timeoutMs) => {
    const buffer = fs.readFileSync(filePath);
    let contentType = 'application/octet-stream';
    if (fileName.endsWith('.pdf')) contentType = 'application/pdf';
    else if (fileName.endsWith('.mp4')) contentType = 'video/mp4';
    else if (fileName.endsWith('.m4a') || fileName.endsWith('.mp3')) contentType = 'audio/mpeg';
    else if (fileName.endsWith('.png')) contentType = 'image/png';
    else if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) contentType = 'image/jpeg';

    const boundary = `----neetforgeBoundary${Date.now()}`;
    const metadata = { name: fileName, parents: [parentFolderId] };

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
        `Timed out uploading file: ${fileName}`
    );

    const data = await response.json();
    if (!response.ok || !data.id) {
        throw new Error(`File upload failed for ${fileName}: ${JSON.stringify(data)}`);
    }
    return data;
};

const makeFilePublic = async (fileId, accessToken, timeoutMs) => {
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
        `Timed out setting permissions for: ${fileId}`
    );

    if (!response.ok) {
        throw new Error(`Permission set failed for ${fileId}: ${await response.text()}`);
    }
};

const buildPublicUrl = (fileId) => `https://drive.google.com/uc?export=view&id=${fileId}`;

const run = async () => {
    try {
        if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing from .env');
        const rootFolderId = String(process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
        if (!rootFolderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID is missing from .env');

        const accessToken = await ensureAccessToken();
        console.log('Google Drive authenticated.');

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB connected.');

        if (!fs.existsSync(FOLDER_PATH)) {
            throw new Error(`Folder path not found: ${FOLDER_PATH}`);
        }

        const chapterFolders = fs.readdirSync(FOLDER_PATH)
            .filter(f => fs.lstatSync(path.join(FOLDER_PATH, f)).isDirectory());
        console.log(`Found ${chapterFolders.length} chapter folders to process.`);

        const processedChapterIds = [];

        for (const chapterId of chapterFolders) {
            if (SKIP_CHAPTERS.includes(chapterId)) {
                console.log(`\nSKIPPING (protected): ${chapterId}`);
                processedChapterIds.push(chapterId); // still counts as valid
                continue;
            }

            console.log(`\nProcessing Chapter: ${chapterId}`);

            // Find chapter in DB
            const chapterDoc = await ImportedCurriculum.findOne({ _id: chapterId });
            if (!chapterDoc) {
                console.log(`Chapter '${chapterId}' not found in DB. Skipping.`);
                continue;
            }

            // Create fresh Drive Folder for Chapter
            console.log(`- Creating Google Drive folder...`);
            const driveFolder = await createFolder(chapterId, rootFolderId, accessToken, DEFAULT_TIMEOUT_MS);
            console.log(`- Folder created. ID: ${driveFolder.id}`);

            const chapterFolderPath = path.join(FOLDER_PATH, chapterId);
            const filesToUpload = fs.readdirSync(chapterFolderPath)
                .filter(f => fs.lstatSync(path.join(chapterFolderPath, f)).isFile());

            // Always start fresh – overwrite
            let toppersEssentials = {};

            for (const fileName of filesToUpload) {
                const filePath = path.join(chapterFolderPath, fileName);
                console.log(`- Uploading ${fileName}...`);

                const uploadedFile = await uploadFile(filePath, fileName, driveFolder.id, accessToken, DEFAULT_TIMEOUT_MS);
                await makeFilePublic(uploadedFile.id, accessToken, DEFAULT_TIMEOUT_MS);

                const fileUrl = buildPublicUrl(uploadedFile.id);
                console.log(`- Uploaded! URL: ${fileUrl}`);

                // Map to Toppers Essentials
                const baseName = fileName.split('.')[0].toLowerCase();
                if (baseName === 'audio') {
                    toppersEssentials.audio = fileUrl;
                } else if (baseName === 'video') {
                    if (!toppersEssentials.video) toppersEssentials.video = {};
                    toppersEssentials.video.url = fileUrl;
                    toppersEssentials.video.title = `${chapterId} Video`;
                } else if (baseName === 'slides') {
                    if (!toppersEssentials.slidesdeck) toppersEssentials.slidesdeck = {};
                    toppersEssentials.slidesdeck.url = fileUrl;
                    toppersEssentials.slidesdeck.title = `${chapterId} Slides`;
                } else if (baseName === 'infographic') {
                    toppersEssentials.infographic = fileUrl;
                } else if (baseName === 'report') {
                    if (!toppersEssentials.report) toppersEssentials.report = {};
                    toppersEssentials.report.url = fileUrl;
                    toppersEssentials.report.title = `${chapterId} Quick Revision`;
                } else if (baseName === 'mindmap') {
                    // mindmap is stored differently – preserve existing to avoid overwriting JSON
                    // Only set if there's no existing mindmap already in DB
                    const existing = chapterDoc.toppersEssentials?.mindmap;
                    if (existing) {
                        toppersEssentials.mindmap = existing;
                        console.log(`  (mindmap: reused existing DB data)`);
                    }
                } else if (baseName === 'flashcards') {
                    if (!toppersEssentials.flashcards) toppersEssentials.flashcards = {};
                    toppersEssentials.flashcards.url = fileUrl;
                    toppersEssentials.flashcards.title = `${chapterId} Flashcards`;
                }
            }

            // Update DB with fresh data
            await ImportedCurriculum.updateOne(
                { _id: chapterId },
                { $set: { toppersEssentials } }
            );
            console.log(`- Updated DB for ${chapterId}`);
            processedChapterIds.push(chapterId);
        }

        // --- CLEANUP: Remove toppersEssentials from ALL other chapters in DB ---
        console.log('\n--- Cleaning up stale toppersEssentials from other chapters ---');
        const cleaned = await ImportedCurriculum.updateMany(
            {
                _id: { $nin: processedChapterIds },
                toppersEssentials: { $exists: true, $ne: {} }
            },
            { $unset: { toppersEssentials: '' } }
        );
        console.log(`Cleaned ${cleaned.modifiedCount} chapters that had stale toppersEssentials.`);

        console.log('\nAll chapters processed successfully.');
    } catch (err) {
        console.error('Error during execution:', err);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
};

run();
