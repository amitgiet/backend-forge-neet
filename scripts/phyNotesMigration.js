/**
 * phyNotesMigration.js
 *
 * Fetches "notes" data from uploads/npcm_phy_database.db,
 * generates slugs, fetches PDF from Firebase,
 * and if the PDF is missing falls back to note-page JPG ids from the
 * comma-separated `question` field, uploading those to Google Drive too.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');

const DB_PATH = path.join(__dirname, '../uploads/npcm_phy_database.db');
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'phy_notes_pdf_migration_log.json');

const FOLDER_NAME = 'phy_notes_fun';
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

const uploadToDrive = async ({ fileName, buffer, contentType, folderId, accessToken }) => {
    const boundary = `----neetforgeBoundary${Date.now()}`;
    const metadata = { name: fileName, parents: [folderId] };

    const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`;
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

const uploadPdfToDrive = (accessToken, folderId, fileName, fileBuffer) =>
    uploadToDrive({ fileName, buffer: fileBuffer, contentType: 'application/pdf', folderId, accessToken });

const uploadImageToDrive = (accessToken, folderId, fileName, fileBuffer) =>
    uploadToDrive({ fileName, buffer: fileBuffer, contentType: 'image/jpeg', folderId, accessToken });

const getNotesFromDB = () => {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
            if (err) return reject(err);
        });

        // Phy DB table is npcmPhy and column is quizType
        db.all("SELECT uniqueId, topicName, question FROM npcmPhy WHERE quizType = 'notes'", [], (err, rows) => {
            db.close();
            if (err) return reject(err);
            resolve(rows);
        });
    });
};

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const getSlug = (topicName) => {
    if (!topicName) return null;
    const parts = topicName.split('>>');
    const first = parts[0].trim();
    if (!first) return null;
    return first.toLowerCase().replace(/\s/g, '_');
};

const parseNotePageIds = (questionText) => {
    if (!questionText || typeof questionText !== 'string') return [];
    return questionText
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
};

const buildPdfMetaUrl = (slug) =>
    `${FIREBASE_BUCKET_BASE}/notes2.0%2Fphysics%2F${encodeURIComponent(slug)}.pdf`;

// New pattern for physics images: npcm%2Fphysics%2FNotes%2F${pageId}.jpg
const buildImageMetaUrl = (pageId) =>
    `${FIREBASE_BUCKET_BASE}/npcm%2Fphysics%2FNotes%2F${encodeURIComponent(pageId)}.jpg`;

const getFirebaseDownloadUrl = async (metaUrl) => {
    const metaRes = await axios.get(metaUrl);
    const token = metaRes.data?.downloadTokens;
    if (!token) {
        throw new Error('No downloadToken found');
    }
    return `${metaUrl}?alt=media&token=${token}`;
};

const loadExistingLogs = () => {
    if (!fs.existsSync(LOG_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    } catch (error) {
        console.warn(`Could not parse existing log file: ${error.message}`);
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

    const notes = await getNotesFromDB();
    console.log(`Found ${notes.length} notes in DB.`);

    const uniqueSlugs = new Set();
    const uniqueNotes = [];
    for (const note of notes) {
        const slug = getSlug(note.topicName);
        if (!slug) continue;
        if (!uniqueSlugs.has(slug)) {
            uniqueSlugs.add(slug);
            uniqueNotes.push({ uniqueId: note.uniqueId, slug, question: note.question });
        } else {
            uniqueNotes.push({ uniqueId: note.uniqueId, slug, question: note.question, duplicate: true });
        }
    }

    const slugToDriveResult = {};
    const limiter = createLimiter(10);
    let done = 0;

    const processNote = async (note) => {
        if (logMap.has(note.uniqueId)) {
            console.log(`Skipping: ${note.uniqueId} ${note.slug}`);
            return;
        }

        const slug = note.slug;
        const notePageIds = parseNotePageIds(note.question);
        const pdfMetaUrl = buildPdfMetaUrl(slug);

        try {
            if (note.duplicate && slugToDriveResult[slug]) {
                logMap.set(note.uniqueId, { uniqueId: note.uniqueId, slug, question: note.question, ...slugToDriveResult[slug], status: 'success_duplicate' });
                safeWrite();
                return;
            }

            console.log(`[${++done}] PDF: ${slug}`);
            const pdfDownloadUrl = await getFirebaseDownloadUrl(pdfMetaUrl);
            const pdfRes = await axios.get(pdfDownloadUrl, { responseType: 'arraybuffer' });
            const driveFile = await uploadPdfToDrive(accessToken, folderId, `${slug}.pdf`, pdfRes.data);

            slugToDriveResult[slug] = { mode: 'pdf', driveLink: driveFile.webViewLink, driveId: driveFile.id };
            logMap.set(note.uniqueId, { uniqueId: note.uniqueId, slug, question: note.question, mode: 'pdf', driveLink: driveFile.webViewLink, driveId: driveFile.id, status: 'success' });
            safeWrite();
            console.log(`  ✓ ${slug} -> ${driveFile.webViewLink}`);

        } catch (pdfError) {
            console.error(`  PDF failed for ${slug}, trying ${notePageIds.length} JPGs...`);

            if (notePageIds.length === 0) {
                logMap.set(note.uniqueId, { uniqueId: note.uniqueId, slug, question: note.question, mode: 'pdf', error: pdfError.message, status: 'failed' });
                safeWrite();
                return;
            }

            try {
                const pageFiles = [];
                for (const pageId of notePageIds) {
                    try {
                        const imgUrl = await getFirebaseDownloadUrl(buildImageMetaUrl(pageId));
                        const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer' });
                        const df = await uploadImageToDrive(accessToken, folderId, `${pageId}.jpg`, imgRes.data);
                        pageFiles.push({ pageId, driveLink: df.webViewLink, driveId: df.id });
                    } catch (e) {
                        console.warn(`    ⚠ Skipping missing page: ${pageId} (${e.response?.status || e.message})`);
                    }
                    await delay(300);
                }

                if (pageFiles.length === 0) throw new Error('No pages available');

                slugToDriveResult[slug] = { mode: 'image_pages', pageCount: pageFiles.length, totalAttempted: notePageIds.length, pageFiles };
                logMap.set(note.uniqueId, { uniqueId: note.uniqueId, slug, question: note.question, mode: 'image_pages', pageCount: pageFiles.length, totalAttempted: notePageIds.length, pageFiles, pdfError: pdfError.message, status: 'success' });
                safeWrite();
                console.log(`  ✓ Fallback: ${slug} (${pageFiles.length}/${notePageIds.length} pages)`);

            } catch (fallbackError) {
                console.error(`  ✗ Fallback failed: ${slug} - ${fallbackError.message}`);
                logMap.set(note.uniqueId, { uniqueId: note.uniqueId, slug, question: note.question, mode: 'image_pages', pageIds: notePageIds, pdfError: pdfError.message, error: fallbackError.message, status: 'failed' });
                safeWrite();
            }
        }
    };

    await Promise.all(uniqueNotes.map((note) => limiter(() => processNote(note))));

    await writeLock;
    writeLogs([...logMap.values()]);

    const entries = [...logMap.values()];
    const succeeded = entries.filter((e) => e.status?.startsWith('success')).length;
    const failed = entries.filter((e) => e.status === 'failed').length;
    console.log(`\nDone! Success: ${succeeded}, Failed: ${failed}, Total: ${uniqueNotes.length}`);
};

main().catch(console.error);
