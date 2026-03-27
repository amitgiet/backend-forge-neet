/**
 * 🎧 NEETForge Podcast TTS Pipeline v3.0
 *
 * PROCESS mode (default):
 *   1. Read podcast URLs from MongoDB (read-only)
 *   2. Download → Transcribe (Gemini) → Translate → TTS → Upload WAV to Drive
 *   3. Save results to local log file only. NO DB writes.
 *
 * UPDATE mode (--update flag):
 *   - Read log file, apply new URLs to MongoDB, delete old Drive files.
 *
 * Usage:
 *   node scripts/podcastTranscribeAndRegenerate.js --subject=biology
 *   node scripts/podcastTranscribeAndRegenerate.js --subject=chemistry
 *   node scripts/podcastTranscribeAndRegenerate.js --update
 */
require('dotenv').config();
const fs      = require('fs');
const path    = require('path');
const axios   = require('axios');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ─── Config ──────────────────────────────────────────────────────────────────
const LOG_DIR      = path.join(__dirname, 'logs');
const FOLDER_NAME  = 'podcast_tts_audio';
const CONCURRENCY  = 10;

const GEMINI_API_KEY         = process.env.GEMINI_API_KEY;
const ACCESS_TOKEN           = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
const MONGO_URI              = process.env.MONGODB_URI;
const IS_UPDATE              = process.argv.includes('--update');
const SUBJECT_FILTER         = (process.argv.find(a => a.startsWith('--subject=')) || '').split('=')[1];
const LOG_FILE               = path.join(LOG_DIR, `podcast_tts_${SUBJECT_FILTER || 'all'}.json`);

if (!GEMINI_API_KEY)  { console.error('❌ GEMINI_API_KEY missing in .env'); process.exit(1); }
if (!ACCESS_TOKEN)    { console.error('❌ GOOGLE_DRIVE_ACCESS_TOKEN missing in .env'); process.exit(1); }
if (!MONGO_URI)       { console.error('❌ MONGODB_URI missing in .env'); process.exit(1); }

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ─── Mongoose Schema (read-only use in process mode) ─────────────────────────
const PodcastItemSchema = new mongoose.Schema({
    uniqueId:         String,
    title:            String,
    driveLink:        String,
    driveId:          String,
    hindiDriveLink:   String,
    hindiDriveId:     String,
    englishDriveLink: String,
    englishDriveId:   String,
}, { _id: false });

const ChapterResourceSchema = new mongoose.Schema({
    _id:         String,   // composite key e.g. "biology::Digestion and Absorption"
    subject:     String,
    chapterName: String,
    podcasts:    [PodcastItemSchema],
}, { collection: 'chapterresources', versionKey: false });

const ChapterResource = mongoose.models.ChapterResource
    || mongoose.model('ChapterResource', ChapterResourceSchema);

// ─── Drive Helpers ───────────────────────────────────────────────────────────
async function getOrCreateFolder(name) {
    const res = await axios.get('https://www.googleapis.com/drive/v3/files', {
        params: { q: `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`, fields: 'files(id)' },
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });
    if (res.data.files.length > 0) return res.data.files[0].id;
    const cr = await axios.post('https://www.googleapis.com/drive/v3/files',
        { name, mimeType: 'application/vnd.google-apps.folder' },
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    return cr.data.id;
}

async function downloadAudio(driveLink) {
    const fileId = driveLink.match(/\/d\/([\w-]+)/)?.[1];
    if (!fileId) throw new Error(`Cannot parse Drive ID from: ${driveLink}`);
    const res = await axios.get(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }, responseType: 'arraybuffer' }
    );
    return Buffer.from(res.data);
}

async function uploadWav({ fileName, buffer, folderId }) {
    const boundary = `--neetforge${Date.now()}`;
    const meta = { name: fileName, parents: [folderId] };
    const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: audio/wav\r\n\r\n`;
    const tail = `\r\n--${boundary}--`;
    const body = Buffer.concat([Buffer.from(head), buffer, Buffer.from(tail)]);

    const up = await axios.post(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
        body,
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': `multipart/related; boundary=${boundary}` } }
    );
    // Make public
    await axios.post(
        `https://www.googleapis.com/drive/v3/files/${up.data.id}/permissions`,
        { role: 'reader', type: 'anyone' },
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    return {
        driveId:   up.data.id,
        driveLink: up.data.webViewLink,
        directUrl: `https://drive.google.com/uc?export=download&id=${up.data.id}`,
    };
}

async function deleteDriveFile(fileId) {
    try {
        await axios.delete(`https://www.googleapis.com/drive/v3/files/${fileId}`,
            { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } });
    } catch (e) { /* ignore */ }
}

// ─── Gemini Helpers ──────────────────────────────────────────────────────────
async function transcribe(audioBuffer) {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const res = await model.generateContent([
        { inlineData: { mimeType: 'audio/mpeg', data: audioBuffer.toString('base64') } },
        { text: 'Transcribe this audio to English text. Output only the transcript, no extra words.' },
    ]);
    return res.response.text().trim();
}

async function translateToHindi(eng) {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const res = await model.generateContent(
        `Translate the following English educational podcast transcript into natural, conversational Hindi for NEET students. Keep scientific terms in brackets. Output only the Hindi translation.\n\n${eng}`
    );
    return res.response.text().trim();
}

async function tts(text, lang) {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-tts' });
    const voice = lang === 'hi' ? 'Kore' : 'Aoede';
    const res = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
    });
    const part = res.response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!part?.inlineData?.data) throw new Error('TTS returned no audio');
    const raw = Buffer.from(part.inlineData.data, 'base64');
    const mime = part.inlineData.mimeType || '';
    // Wrap in WAV header if raw PCM
    if (mime.includes('pcm') || mime.includes('L16')) return pcmToWav(raw, 24000);
    return raw;
}

function pcmToWav(pcm, rate) {
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
    h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
    h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
    h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
    h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([h, pcm]);
}

// ─── Atomic Log (sequential write queue prevents corruption) ─────────────────
let logQueue = Promise.resolve();
function loadLog() {
    try { return fs.existsSync(LOG_FILE) ? JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')) : {}; }
    catch { return {}; }
}
function saveEntry(uniqueId, data) {
    logQueue = logQueue.then(() => {
        const log = loadLog();
        log[uniqueId] = data;
        fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2), 'utf8');
    });
    return logQueue;
}

// ─── Process one podcast ──────────────────────────────────────────────────────
async function processOne(item, folderId) {
    const { uniqueId, title, driveLink, driveId: oldDriveId, subject, chapterName } = item;
    const label = `[${subject}] ${chapterName} → ${title}`;
    console.log(`🎙  START  ${label}`);

    try {
        const audio    = await downloadAudio(driveLink);
        const engText  = await transcribe(audio);
        const hiText   = await translateToHindi(engText);

        // Generate both TTS audios in parallel
        const [enWav, hiWav] = await Promise.all([tts(engText, 'en'), tts(hiText, 'hi')]);

        // Upload both in parallel
        const [enDrive, hiDrive] = await Promise.all([
            uploadWav({ fileName: `${uniqueId}_en.wav`, buffer: enWav, folderId }),
            uploadWav({ fileName: `${uniqueId}_hi.wav`, buffer: hiWav, folderId }),
        ]);

        await saveEntry(uniqueId, {
            uniqueId, subject, chapterName, title,
            status: 'success', processedAt: new Date().toISOString(),
            oldDriveLink: driveLink, oldDriveId,
            english: { transcript: engText, ...enDrive },
            hindi:   { transcript: hiText,  ...hiDrive },
            dbUpdated: false,
        });

        console.log(`✅ DONE   ${label}`);
    } catch (err) {
        console.error(`❌ FAIL   ${label}: ${err.message}`);
        await saveEntry(uniqueId, {
            uniqueId, subject, chapterName, title,
            status: 'failed', error: err.message,
            processedAt: new Date().toISOString(),
            oldDriveLink: driveLink, oldDriveId,
        });
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // ── UPDATE MODE ──────────────────────────────────────────────────────────
    if (IS_UPDATE) {
        const log = loadLog();
        const toUpdate = Object.values(log).filter(e => e.status === 'success' && !e.dbUpdated);
        console.log(`🔄 Applying ${toUpdate.length} entries to DB...`);

        for (const entry of toUpdate) {
            try {
                const res = await ChapterResource.updateOne(
                    { 'podcasts.uniqueId': entry.uniqueId },
                    { $set: {
                        'podcasts.$.englishDriveLink': entry.english.driveLink,
                        'podcasts.$.englishDriveId':   entry.english.driveId,
                        'podcasts.$.hindiDriveLink':   entry.hindi.driveLink,
                        'podcasts.$.hindiDriveId':     entry.hindi.driveId,
                    }}
                );
                if (res.modifiedCount > 0) {
                    if (entry.oldDriveId) await deleteDriveFile(entry.oldDriveId);
                    entry.dbUpdated = true;
                    await saveEntry(entry.uniqueId, entry);
                    console.log(`  ✅ Updated: ${entry.uniqueId}`);
                } else {
                    console.warn(`  ⚠️  Not found in DB: ${entry.uniqueId}`);
                }
            } catch (e) {
                console.error(`  ❌ DB error for ${entry.uniqueId}: ${e.message}`);
            }
        }
        await mongoose.disconnect();
        console.log('✅ Update complete.');
        return;
    }

    // ── PROCESS MODE ─────────────────────────────────────────────────────────
    const query = SUBJECT_FILTER ? { subject: SUBJECT_FILTER } : {};
    const docs  = await ChapterResource.find(query).lean();
    await mongoose.disconnect(); // Done with DB — no more DB calls during processing
    console.log('✅ Fetched podcasts from DB. Disconnected from MongoDB.\n');

    const log = loadLog();
    const items = [];
    for (const doc of docs) {
        for (const p of (doc.podcasts || [])) {
            if (!p.driveLink) continue;
            if (log[p.uniqueId]?.status === 'success') continue; // already done
            items.push({ ...p, subject: doc.subject, chapterName: doc.chapterName });
        }
    }

    console.log(`🚀 ${items.length} podcasts to process | Concurrency: ${CONCURRENCY}`);
    if (items.length === 0) { console.log('Nothing to do.'); return; }

    const folderId = await getOrCreateFolder(FOLDER_NAME);
    console.log(`📁 Drive folder: ${folderId}\n`);

    // Worker pool — 10 workers pull from shared index
    let idx = 0;
    const worker = async () => {
        while (idx < items.length) {
            const item = items[idx++];
            await processOne(item, folderId);
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    // Summary
    const final   = loadLog();
    const success = Object.values(final).filter(e => e.status === 'success').length;
    const failed  = Object.values(final).filter(e => e.status === 'failed').length;
    console.log(`\n${'═'.repeat(55)}`);
    console.log(`  ✅ Success: ${success}   ❌ Failed: ${failed}`);
    console.log(`  📄 Log: ${LOG_FILE}`);
    console.log(`  ▶  Run with --update when ready to push to DB`);
    console.log(`${'═'.repeat(55)}\n`);
}

main().catch(err => { console.error('💥 Fatal:', err.message); process.exit(1); });
