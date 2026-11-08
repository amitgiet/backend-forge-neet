require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Transform } = require('stream');
const mongoose = require('mongoose');
const axios = require('axios');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

// ============================================================================
// 1. Sanitize Public Domain & Config
// ============================================================================
const R2_DOMAIN = (process.env.R2_PUBLIC_DOMAIN || '').replace(/\/+$/, '');
if (!R2_DOMAIN) {
  console.error('ERROR: R2_PUBLIC_DOMAIN environment variable missing hai.');
  process.exit(1);
}

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI / MONGODB_URI missing hai.');
  process.exit(1);
}

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'neetforge';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '10', 10);

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const RUN_LIMIT = limitIdx !== -1 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ============================================================================
// 2. Dynamic Target Locations Configuration (NEETForge Collections)
// ============================================================================
const TARGETS = [
  { collection: 'formulacards', label: 'Formula Flashcards (imgUrl, hindiImgUrl)' },
  { collection: 'mocktests', label: 'Mock Tests (resources, source.raw PDFs)' },
  { collection: 'chapterresources', label: 'Chapter Resources (notes, podcasts, memes)' },
  { collection: 'importedcurriculum', label: 'Imported Curriculum (toppersEssentials)' },
];

const MAPPING_FILE = path.join(__dirname, 'migration_mapping.jsonl');
const FAILED_FILE = path.join(__dirname, 'migration_failed.jsonl');
const LOCK_FILE = path.join(__dirname, 'migration.lock');

// ============================================================================
// 3. Atomic File Lock with ENOENT Read Safety
// ============================================================================
function acquireSafeLock() {
  try {
    const fd = fs.openSync(LOCK_FILE, 'wx');
    fs.writeSync(fd, process.pid.toString());
    fs.closeSync(fd);
  } catch (err) {
    if (err.code === 'EEXIST') {
      let oldPid = null;
      try {
        oldPid = parseInt(fs.readFileSync(LOCK_FILE, 'utf-8').trim(), 10);
      } catch (_) {
        return acquireSafeLock();
      }

      if (oldPid) {
        try {
          process.kill(oldPid, 0);
          console.error(`[LOCKED] Process ${oldPid} abhi bhi chal rahi hai. Exiting.`);
          process.exit(1);
        } catch (e) {
          console.warn(`[STALE LOCK] Dead process ${oldPid} mila. Lock replace kar rahe hain...`);
          try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
          return acquireSafeLock();
        }
      } else {
        try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
        return acquireSafeLock();
      }
    } else {
      throw err;
    }
  }
}

const cleanupLock = () => {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const currentLockPid = parseInt(fs.readFileSync(LOCK_FILE, 'utf-8').trim(), 10);
      if (currentLockPid === process.pid) fs.unlinkSync(LOCK_FILE);
    }
  } catch (_) {}
};

acquireSafeLock();
process.on('exit', cleanupLock);
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  cleanupLock();
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  cleanupLock();
  process.exit(1);
});

// ============================================================================
// 4. R2 Client & Graceful Shutdown
// ============================================================================
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

let isShuttingDown = false;
process.on('SIGINT', () => {
  console.log('\n[Graceful Stop] Active transfers complete hone ke baad script safely ruk jayegi...');
  isShuttingDown = true;
});
process.on('SIGTERM', () => {
  console.log('\n[SIGTERM] Active transfers complete hone ke baad script safely ruk jayegi...');
  isShuttingDown = true;
});

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// ============================================================================
// 5. URL Extraction & Dynamic Field Discovery
// ============================================================================
function extractDriveIdAndType(url) {
  if (!url || typeof url !== 'string') return { id: null, isFolder: false };
  if (url.includes('/folders/') || url.includes('/drive/u/0/folders/')) {
    return { id: null, isFolder: true };
  }
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]{25,})/,
    /\/document\/d\/([a-zA-Z0-9_-]{25,})/,
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]{25,})/,
    /\/presentation\/d\/([a-zA-Z0-9_-]{25,})/,
    /[?&]id=([a-zA-Z0-9_-]{25,})/,
    /\/d\/([a-zA-Z0-9_-]{25,})/,
  ];
  for (const regex of patterns) {
    const match = url.match(regex);
    if (match && match[1]) return { id: match[1], isFolder: false };
  }
  return { id: null, isFolder: false };
}

function extractDriveFieldsFromDoc(doc, prefix = '') {
  const results = [];
  if (!doc || typeof doc !== 'object') return results;

  for (const [key, val] of Object.entries(doc)) {
    if (prefix === '' && (key === '_id' || key.startsWith('__'))) continue;
    const currentPath = prefix ? `${prefix}.${key}` : key;

    if (typeof val === 'string') {
      if (/drive\.google\.com|docs\.google\.com|googleusercontent\.com/i.test(val)) {
        results.push({ field: currentPath, url: val });
      }
    } else if (Array.isArray(val)) {
      val.forEach((item, index) => {
        if (typeof item === 'string') {
          if (/drive\.google\.com|docs\.google\.com|googleusercontent\.com/i.test(item)) {
            results.push({ field: `${currentPath}.${index}`, url: item });
          }
        } else if (item && typeof item === 'object') {
          results.push(...extractDriveFieldsFromDoc(item, `${currentPath}.${index}`));
        }
      });
    } else if (val && typeof val === 'object' && !(val instanceof mongoose.Types.ObjectId) && !(val instanceof Date)) {
      results.push(...extractDriveFieldsFromDoc(val, currentPath));
    }
  }

  return results;
}

async function withSmartRetry(fn, retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const status = err.response ? err.response.status : null;
      if (status === 404) throw new Error('File Not Found on Google Drive (404)');
      const waitTime = (status === 429 || status === 403) ? 15000 * attempt : 2000 * Math.pow(2, attempt - 1);
      console.log(`   [Retry ${attempt}/${retries - 1}] Issue: ${err.message}. Waiting ${waitTime / 1000}s...`);
      await sleep(waitTime);
    }
  }
}

function createValidationAndHashTransform(expectedMimeType) {
  const hash = crypto.createHash('md5');
  let downloadedBytes = 0;
  let firstChunkChecked = false;

  const transformStream = new Transform({
    transform(chunk, encoding, callback) {
      try {
        if (!firstChunkChecked) {
          firstChunkChecked = true;
          const headerStr = chunk.slice(0, 20).toString('utf-8');
          if (headerStr.includes('<!DOCTYPE') || headerStr.includes('<html')) {
            return callback(new Error('Stream contains HTML error/login page instead of binary'));
          }
          if (expectedMimeType === 'application/pdf' && !headerStr.startsWith('%PDF-')) {
            return callback(new Error('Invalid PDF header (missing %PDF- magic bytes)'));
          }
        }
        hash.update(chunk);
        downloadedBytes += chunk.length;
        callback(null, chunk);
      } catch (err) {
        callback(err);
      }
    }
  });

  return {
    transformStream,
    getStats: () => ({
      downloadedBytes,
      calculatedMd5: hash.digest('hex'),
    }),
  };
}

// ============================================================================
// 6. JSON Mapping Helper Functions (Zero DB Writes)
// ============================================================================
function loadExistingMappingState() {
  const completedDocKeys = new Set();
  const driveIdToR2Map = new Map();

  if (fs.existsSync(MAPPING_FILE)) {
    const content = fs.readFileSync(MAPPING_FILE, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        if (item.collection && item.docId && item.field) {
          completedDocKeys.add(`${item.collection}:${item.docId}:${item.field}`);
        }
        if (item.driveFileId && item.newR2Url) {
          driveIdToR2Map.set(item.driveFileId, {
            newR2Url: item.newR2Url,
            r2FileKey: item.r2FileKey,
            fileMd5: item.fileMd5,
            fileSize: item.fileSize,
          });
        }
      } catch (_) {}
    }
  }
  return { completedDocKeys, driveIdToR2Map };
}

function appendJsonLine(filePath, record) {
  fs.appendFileSync(filePath, JSON.stringify(record) + '\n');
}

// In-Flight promises map to prevent parallel workers from downloading the same file ID
const inFlightUploads = new Map();

// ============================================================================
// 7. Single Task Processor (Download from Drive & Upload to R2)
// ============================================================================
async function processTask(task, state) {
  const { collection, docId, field, rawUrl } = task;
  const { completedDocKeys, driveIdToR2Map } = state;
  const uniqueKey = `${collection}:${docId}:${field}`;

  if (completedDocKeys.has(uniqueKey)) {
    return;
  }

  const { id: rawFileId, isFolder } = extractDriveIdAndType(rawUrl);

  if (isFolder) {
    appendJsonLine(FAILED_FILE, {
      collection,
      docId,
      field,
      url: rawUrl,
      reason: 'is_folder_link',
      failedAt: new Date().toISOString()
    });
    return;
  }

  if (!rawFileId) {
    appendJsonLine(FAILED_FILE, {
      collection,
      docId,
      field,
      url: rawUrl,
      reason: 'invalid_url',
      failedAt: new Date().toISOString()
    });
    return;
  }

  // Deduplication Case 1: Already uploaded earlier (cached)
  if (driveIdToR2Map.has(rawFileId)) {
    const cached = driveIdToR2Map.get(rawFileId);
    const mappingRecord = {
      collection,
      docId,
      field,
      oldUrl: rawUrl,
      driveFileId: rawFileId,
      newR2Url: cached.newR2Url,
      r2FileKey: cached.r2FileKey,
      fileMd5: cached.fileMd5,
      fileSize: cached.fileSize,
      migratedAt: new Date().toISOString(),
      reused: true
    };
    appendJsonLine(MAPPING_FILE, mappingRecord);
    completedDocKeys.add(uniqueKey);
    console.log(`[DEDUP REUSED] ${collection}:${docId} (${field}) -> Reused ${rawFileId}`);
    return;
  }

  // Deduplication Case 2: Currently being downloaded by another parallel worker
  if (inFlightUploads.has(rawFileId)) {
    try {
      const cached = await inFlightUploads.get(rawFileId);
      const mappingRecord = {
        collection,
        docId,
        field,
        oldUrl: rawUrl,
        driveFileId: rawFileId,
        newR2Url: cached.newR2Url,
        r2FileKey: cached.r2FileKey,
        fileMd5: cached.fileMd5,
        fileSize: cached.fileSize,
        migratedAt: new Date().toISOString(),
        reused: true
      };
      appendJsonLine(MAPPING_FILE, mappingRecord);
      completedDocKeys.add(uniqueKey);
      console.log(`[IN-FLIGHT REUSED] ${collection}:${docId} (${field}) -> Reused ${rawFileId}`);
      return;
    } catch (e) {
      // If the in-flight upload failed, fall through to retry independently
    }
  }

  // Create upload promise and register in flight
  const uploadPromise = (async () => {
    let fileMeta = null;
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const metaUrl = `https://www.googleapis.com/drive/v3/files/${rawFileId}?fields=id,name,size,mimeType,md5Checksum,shortcutDetails&key=${apiKey}`;
        const metaRes = await axios.get(metaUrl, { timeout: 10000 });
        fileMeta = metaRes.data;

        if (fileMeta.mimeType === 'application/vnd.google-apps.shortcut' && fileMeta.shortcutDetails?.targetId) {
          const targetId = fileMeta.shortcutDetails.targetId;
          const targetMetaUrl = `https://www.googleapis.com/drive/v3/files/${targetId}?fields=id,name,size,mimeType,md5Checksum&key=${apiKey}`;
          const targetMetaRes = await axios.get(targetMetaUrl, { timeout: 10000 });
          fileMeta = targetMetaRes.data;
        }
      } catch (_) {
        fileMeta = null;
      }
    }

    const activeFileId = fileMeta?.id || rawFileId;
    const isGoogleWorkspaceDoc = fileMeta?.mimeType?.startsWith('application/vnd.google-apps.') || rawUrl.includes('docs.google.com');

    let downloadUrl = '';
    let fallbackExportUrl = '';
    let finalMimeType = fileMeta?.mimeType || 'application/octet-stream';
    let ext = path.extname(fileMeta?.name || '') || '';

    if (isGoogleWorkspaceDoc) {
      finalMimeType = 'application/pdf';
      ext = '.pdf';
      if (apiKey) {
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${activeFileId}/export?mimeType=application/pdf&key=${apiKey}`;
      }
      if (rawUrl.includes('/document/') || fileMeta?.mimeType?.includes('document')) {
        fallbackExportUrl = `https://docs.google.com/document/d/${activeFileId}/export?format=pdf`;
      } else if (rawUrl.includes('/presentation/') || fileMeta?.mimeType?.includes('presentation')) {
        fallbackExportUrl = `https://docs.google.com/presentation/d/${activeFileId}/export/pdf`;
      } else if (rawUrl.includes('/spreadsheets/') || fileMeta?.mimeType?.includes('spreadsheets')) {
        fallbackExportUrl = `https://docs.google.com/spreadsheets/d/${activeFileId}/export?format=pdf`;
      }
      if (!downloadUrl) downloadUrl = fallbackExportUrl;
    } else {
      downloadUrl = `https://drive.google.com/uc?export=download&id=${activeFileId}`;
    }

    // Try direct HEAD to resolve content-type and extension if missing
    if (!ext || finalMimeType === 'application/octet-stream') {
      try {
        const headRes = await axios.head(downloadUrl, { timeout: 8000, maxRedirects: 5 });
        const ct = headRes.headers['content-type'] || '';
        if (ct.includes('pdf')) { ext = '.pdf'; finalMimeType = 'application/pdf'; }
        else if (ct.includes('jpeg') || ct.includes('jpg')) { ext = '.jpg'; finalMimeType = 'image/jpeg'; }
        else if (ct.includes('png')) { ext = '.png'; finalMimeType = 'image/png'; }
        else if (ct.includes('webp')) { ext = '.webp'; finalMimeType = 'image/webp'; }
        else if (ct.includes('audio') || ct.includes('mpeg') || ct.includes('mp3')) { ext = '.mp3'; finalMimeType = 'audio/mpeg'; }
      } catch (_) {}
    }
    if (!ext) ext = '.pdf';

    const fileKey = `neetforge/${activeFileId}${ext}`;

    // Check if file already exists on R2
    let alreadyOnR2 = false;
    let finalByteSize = Number(fileMeta?.size) || 0;
    try {
      const head = await r2.send(new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileKey,
      }));
      if (head.ContentLength && Number(head.ContentLength) > 100) {
        alreadyOnR2 = true;
        finalByteSize = Number(head.ContentLength);
      }
    } catch (_) {
      alreadyOnR2 = false;
    }

    let finalMd5 = fileMeta?.md5Checksum || '';

    if (!alreadyOnR2) {
      await withSmartRetry(async () => {
        let streamRes;
        try {
          streamRes = await axios.get(downloadUrl, {
            responseType: 'stream',
            timeout: 120000,
            maxRedirects: 5,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });
        } catch (err) {
          if (fallbackExportUrl) {
            streamRes = await axios.get(fallbackExportUrl, {
              responseType: 'stream',
              timeout: 120000,
              maxRedirects: 5,
            });
          } else {
            throw err;
          }
        }

        const respContentType = streamRes.headers['content-type'] || '';
        if (respContentType.includes('text/html')) {
          streamRes.data.destroy();
          throw new Error('Google returned HTML warning/login page instead of binary');
        }

        const { transformStream, getStats } = createValidationAndHashTransform(finalMimeType);
        const bodyStream = streamRes.data.pipe(transformStream);
        streamRes.data.on('error', (err) => transformStream.destroy(err));

        const parallelUpload = new Upload({
          client: r2,
          params: {
            Bucket: BUCKET_NAME,
            Key: fileKey,
            Body: bodyStream,
            ContentType: finalMimeType,
          },
          queueSize: 3,
          partSize: 5 * 1024 * 1024,
          leavePartsOnError: false,
        });

        await parallelUpload.done();

        const { downloadedBytes, calculatedMd5 } = getStats();
        if (downloadedBytes < 100) {
          throw new Error(`File too small (${downloadedBytes}B), likely corrupted`);
        }

        finalByteSize = downloadedBytes;
        finalMd5 = calculatedMd5;
      });
    }

    const newR2Url = `${R2_DOMAIN}/${fileKey}`;
    return { newR2Url, r2FileKey: fileKey, fileMd5: finalMd5, fileSize: finalByteSize };
  })();

  inFlightUploads.set(rawFileId, uploadPromise);

  try {
    const result = await uploadPromise;
    driveIdToR2Map.set(rawFileId, result);

    const mappingRecord = {
      collection,
      docId,
      field,
      oldUrl: rawUrl,
      driveFileId: rawFileId,
      newR2Url: result.newR2Url,
      r2FileKey: result.r2FileKey,
      fileMd5: result.fileMd5,
      fileSize: result.fileSize,
      migratedAt: new Date().toISOString(),
      reused: false
    };

    appendJsonLine(MAPPING_FILE, mappingRecord);
    completedDocKeys.add(uniqueKey);
    console.log(`[MAPPED] ${collection}:${docId} (${field}) -> ${result.r2FileKey} (${(result.fileSize / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error(`[ERROR] ${collection}:${docId} (${field}): ${err.message}`);
    appendJsonLine(FAILED_FILE, {
      collection,
      docId,
      field,
      url: rawUrl,
      error: err.message,
      failedAt: new Date().toISOString()
    });
  } finally {
    inFlightUploads.delete(rawFileId);
  }
}

// ============================================================================
// 8. Main Migration Execution (Concurrency 5 Worker Pool)
// ============================================================================
async function runJsonOnlyMigration() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB in READ-ONLY mode. Zero writes to DB.');
  console.log(`Cloudflare R2 Bucket: "${BUCKET_NAME}"`);
  console.log(`Public Domain: "${R2_DOMAIN}"`);
  console.log(`Concurrency: ${CONCURRENCY} parallel streams\n`);

  const db = mongoose.connection.db;
  const state = loadExistingMappingState();
  console.log(`[Resume State] Loaded ${state.completedDocKeys.size} previously mapped fields from JSONL.`);

  let totalProcessed = 0;

  for (const target of TARGETS) {
    if (isShuttingDown || totalProcessed >= RUN_LIMIT) break;

    console.log(`\n======================================================`);
    console.log(`Scanning Collection: "${target.collection}" - ${target.label}`);
    console.log(`======================================================`);

    const collection = db.collection(target.collection);
    const docs = await collection.find({}).toArray();

    const queue = [];
    for (const doc of docs) {
      const docId = doc._id.toString();
      const extractedFields = extractDriveFieldsFromDoc(doc);
      for (const item of extractedFields) {
        queue.push({
          collection: target.collection,
          docId,
          field: item.field,
          rawUrl: item.url
        });
      }
    }

    console.log(`Total Drive fields found in "${target.collection}": ${queue.length}. Starting ${CONCURRENCY} independent workers...`);

    let queueIdx = 0;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queueIdx < queue.length) {
        if (isShuttingDown || totalProcessed >= RUN_LIMIT) break;
        const task = queue[queueIdx++];
        if (!task) break;

        await processTask(task, state);
        totalProcessed++;
      }
    });

    await Promise.all(workers);

    if (totalProcessed >= RUN_LIMIT) {
      console.log(`[LIMIT REACHED] Processed ${totalProcessed} items matching --limit.`);
      break;
    }
  }

  console.log(`\n======================================================`);
  console.log(`[DONE] JSON Mapping Pass Completed!`);
  console.log(`Total Mapped: ${totalProcessed}`);
  console.log(`Mapping Output: ${MAPPING_FILE}`);
  console.log(`Failed / Errors: ${FAILED_FILE}`);
  console.log(`DB remains completely untouched.`);
  console.log(`======================================================\n`);

  cleanupLock();
  process.exit(0);
}

runJsonOnlyMigration();
