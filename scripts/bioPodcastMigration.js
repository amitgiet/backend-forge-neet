/**
 * bioPodcastMigration.js
 *
 * Migrates Biology podcast audio files from Firebase to Google Drive.
 * Fetches IDs from the `question` field in npcm_bio_database.db.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');

const DB_PATH = path.join(__dirname, '../uploads/npcm_bio_database.db');
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'bio_podcast_migration_log.json');

const FOLDER_NAME = 'bio_podcasts_fun';
const FIREBASE_BUCKET_BASE = 'https://firebasestorage.googleapis.com/v0/b/memoneet-5498.appspot.com/o';

const ensureAccessToken = () => {
    const token = String(process.env.GOOGLE_DRIVE_ACCESS_TOKEN || '').trim();
    if (!token) throw new Error('GOOGLE_DRIVE_ACCESS_TOKEN is missing in .env');
    return token;
};

const getFolderId = async (accessToken) => {
    const res = await axios.get('https://www.googleapis.com/drive/v3/files', {
        params: {
            q: `mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive'
        },
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (res.data.files.length > 0) {
        return res.data.files[0].id;
    }

    console.log(`Creating new folder: ${FOLDER_NAME}`);
    const folderRes = await axios.post('https://www.googleapis.com/drive/v3/files', {
        name: FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder'
    }, {
        headers: { 
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    });
    
    const folderId = folderRes.data.id;

    // Make folder public
    await axios.post(`https://www.googleapis.com/drive/v3/files/${folderId}/permissions`, {
        role: 'reader',
        type: 'anyone'
    }, {
        headers: { 
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    });

    return folderId;
};

const uploadPodcastToDrive = async ({ fileName, buffer, folderId, accessToken }) => {
    const boundary = `----neetforgeBoundary${Date.now()}`;
    const metadata = { name: fileName, parents: [folderId] };

    const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: audio/mpeg\r\n\r\n`;
    const tail = `\r\n--${boundary}--`;
    
    const body = Buffer.concat([
        Buffer.from(head),
        buffer,
        Buffer.from(tail)
    ]);

    const res = await axios.post('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', body, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
        }
    });

    // Make file public
    await axios.post(`https://www.googleapis.com/drive/v3/files/${res.data.id}/permissions`, {
        role: 'reader',
        type: 'anyone'
    }, {
        headers: { 
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    });

    return res.data;
};

const getPodcastsFromDB = () => {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
            if (err) return reject(err);
        });

        // Use PRAGMA to check columns if necessary, but we'll assume camelCase based on previous scans
        db.all("SELECT uniqueId, topicName, question FROM npcmBio WHERE quizType = 'podcast'", [], (err, rows) => {
            db.close();
            if (err) return reject(err);
            resolve(rows);
        });
    });
};

const buildAudioMetaUrl = (id) =>
    `${FIREBASE_BUCKET_BASE}/npcm%2Fpodcast%2F${encodeURIComponent(id)}.mp3`;

const getFirebaseDownloadUrl = async (metaUrl) => {
    try {
        const metaRes = await axios.get(metaUrl);
        const token = metaRes.data?.downloadTokens;
        if (!token) throw new Error('No downloadToken found');
        return `${metaUrl}?alt=media&token=${token}`;
    } catch (err) {
        throw new Error(`Firebase Metadata failed: ${err.message}`);
    }
};

const loadExistingLogs = () => {
    if (!fs.existsSync(LOG_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    } catch (error) {
        return [];
    }
};

const writeLogs = (entries) => {
    fs.writeFileSync(LOG_FILE, JSON.stringify(entries, null, 2));
};

const createLimiter = (concurrency) => {
    let active = 0;
    const queue = [];
    const next = () => {
        if (!queue.length || active >= concurrency) return;
        active += 1;
        const { fn, resolve, reject } = queue.shift();
        Promise.resolve().then(fn)
            .then((r) => { active -= 1; resolve(r); next(); })
            .catch((e) => { active -= 1; reject(e); next(); });
    };
    return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
};

const main = async () => {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

    const logMap = new Map();
    for (const entry of loadExistingLogs()) {
        logMap.set(entry.uniqueId, entry);
    }

    let writeLock = Promise.resolve();
    const safeWrite = () => {
        writeLock = writeLock.then(() => {
            writeLogs([...logMap.values()]);
        }).catch((e) => console.error('Write error:', e.message));
    };

    const accessToken = ensureAccessToken();
    const folderId = await getFolderId(accessToken);
    console.log(`Target Folder ID: ${folderId}`);

    const podcasts = await getPodcastsFromDB();
    console.log(`Found ${podcasts.length} podcasts in DB.`);

    const limiter = createLimiter(10);
    let done = 0;

    const processPodcast = async (p) => {
        if (logMap.has(p.uniqueId) && logMap.get(p.uniqueId).status === 'success') {
            // Already migrated
            return;
        }

        const audioId = p.question?.trim();
        if (!audioId) {
            logMap.set(p.uniqueId, { ...p, status: 'failed', error: 'No audio ID' });
            safeWrite();
            return;
        }

        try {
            console.log(`[${++done}] Migrating: ${audioId}`);
            const metaUrl = buildAudioMetaUrl(audioId);
            const downloadUrl = await getFirebaseDownloadUrl(metaUrl);
            const res = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
            
            const driveFile = await uploadPodcastToDrive({
                fileName: `${audioId}.mp3`,
                buffer: res.data,
                folderId,
                accessToken
            });

            logMap.set(p.uniqueId, {
                uniqueId: p.uniqueId,
                topicName: p.topicName,
                audioId,
                driveLink: driveFile.webViewLink,
                driveId: driveFile.id,
                status: 'success'
            });
            safeWrite();
            console.log(`  ✓ ${audioId} -> ${driveFile.webViewLink}`);

        } catch (err) {
            console.error(`  ✗ Failed: ${audioId} - ${err.message}`);
            logMap.set(p.uniqueId, {
                uniqueId: p.uniqueId,
                topicName: p.topicName,
                audioId,
                status: 'failed',
                error: err.message
            });
            safeWrite();
        }
    };

    await Promise.all(podcasts.map((p) => limiter(() => processPodcast(p))));
    await writeLock;
    console.log(`\nMigration complete. Total: ${podcasts.length}`);
};

main().catch(console.error);
