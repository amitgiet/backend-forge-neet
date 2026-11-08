/**
 * migrateMemoneetImagesToR2.js
 *
 * Transfers questions diagram images (imageUrl & explanationImageUrl) from
 * Memoneet GCS (https://storage.googleapis.com/memoneet-image-storage/...)
 * to our own Cloudflare R2 bucket (neetforge).
 *
 * Produces a JSONL mapping file: scripts/memoneet_image_r2_mapping.jsonl
 * which can then be applied to MongoDB via applyMemoneetImageR2ToDB.js.
 *
 * Features:
 *   - Idempotent HeadObject checks (skips already uploaded files in R2)
 *   - Resume capability (skips already mapped files from previous runs)
 *   - Configurable concurrency pool (default: 15)
 *   - Atomic PID lock file to prevent overlapping runs
 *   - Graceful shutdown on SIGINT / SIGTERM
 *   - Support for --dry-run, --limit <N>, --concurrency <N>
 *
 * Usage:
 *   node scripts/migrateMemoneetImagesToR2.js --dry-run
 *   node scripts/migrateMemoneetImagesToR2.js --limit 50
 *   node scripts/migrateMemoneetImagesToR2.js
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
require('colors');

// ============================================================================
// 1. Config & Pre-flight Assertions
// ============================================================================
const R2_DOMAIN = (process.env.R2_PUBLIC_DOMAIN || '').replace(/\/+$/, '');
const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'neetforge';
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!R2_DOMAIN) {
  console.error('❌ ERROR: R2_PUBLIC_DOMAIN environment variable is missing in .env'.red.bold);
  process.exit(1);
}
if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
  console.error('❌ ERROR: Cloudflare R2 credentials (ACCOUNT_ID, ACCESS_KEY_ID, SECRET_ACCESS_KEY) missing in .env'.red.bold);
  process.exit(1);
}
if (!MONGO_URI) {
  console.error('❌ ERROR: MONGODB_URI missing in .env'.red.bold);
  process.exit(1);
}

// CLI Arguments
const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');

const limitIdx = args.indexOf('--limit');
const RUN_LIMIT = limitIdx !== -1 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : Infinity;

const concurrencyIdx = args.indexOf('--concurrency');
const CONCURRENCY = concurrencyIdx !== -1 && args[concurrencyIdx + 1]
  ? parseInt(args[concurrencyIdx + 1], 10)
  : parseInt(process.env.CONCURRENCY || '10', 10);

const MAPPING_FILE = path.join(__dirname, 'memoneet_image_r2_mapping.jsonl');
const FAILED_FILE = path.join(__dirname, 'memoneet_image_r2_failed.jsonl');
const LOCK_FILE = path.join(__dirname, 'memoneet_image_migration.lock');

// ============================================================================
// 2. Atomic Lock Management
// ============================================================================
function acquireLock() {
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
        return acquireLock();
      }

      if (oldPid) {
        try {
          process.kill(oldPid, 0);
          console.error(`❌ [LOCKED] Process ${oldPid} is already running. Exiting.`.red.bold);
          process.exit(1);
        } catch (_) {
          console.warn(`⚠️  [STALE LOCK] Detected stale lock from dead PID ${oldPid}. Reclaiming lock...`.yellow);
          try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
          return acquireLock();
        }
      } else {
        try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
        return acquireLock();
      }
    } else {
      throw err;
    }
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockPid = parseInt(fs.readFileSync(LOCK_FILE, 'utf-8').trim(), 10);
      if (lockPid === process.pid) fs.unlinkSync(LOCK_FILE);
    }
  } catch (_) {}
}

// ============================================================================
// 3. Cloudflare R2 Client & Shutdown Handlers
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
const requestShutdown = () => {
  if (!isShuttingDown) {
    console.log('\n[GRACEFUL STOP] In-flight transfers will finish, then script will safely exit...'.yellow.bold);
    isShuttingDown = true;
  }
};

process.on('SIGINT', requestShutdown);
process.on('SIGTERM', requestShutdown);
process.on('exit', releaseLock);
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  releaseLock();
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  releaseLock();
  process.exit(1);
});

// ============================================================================
// 4. Utility Functions
// ============================================================================
function getR2KeyFromGcsUrl(url) {
  try {
    const parsed = new URL(url);
    let pathname = parsed.pathname.replace(/^\/+/, '');
    if (pathname.startsWith('memoneet-image-storage/')) {
      pathname = pathname.replace(/^memoneet-image-storage\//, '');
    }
    return `images/questions/${pathname}`;
  } catch (_) {
    const filename = path.basename(url.split('?')[0]);
    return `images/questions/misc/${filename}`;
  }
}

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.svg': return 'image/svg+xml';
    case '.gif': return 'image/gif';
    default: return 'application/octet-stream';
  }
}

async function checkR2ObjectExists(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    return true;
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    return false;
  }
}

function loadExistingMappings() {
  const existingMap = new Map();
  if (fs.existsSync(MAPPING_FILE)) {
    const lines = fs.readFileSync(MAPPING_FILE, 'utf-8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        if (item.originalUrl && item.r2Url) {
          existingMap.set(item.originalUrl, item.r2Url);
        }
      } catch (_) {}
    }
  }
  return existingMap;
}

// ============================================================================
// 5. Main Migration Engine
// ============================================================================
async function main() {
  acquireLock();

  console.log('\n======================================================================'.magenta.bold);
  console.log('       MEMONEET GCS TO CLOUDFLARE R2 IMAGE MIGRATION ENGINE           '.magenta.bold);
  console.log('======================================================================'.magenta.bold);
  console.log(`Execution Mode: ${IS_DRY_RUN ? '🛡️  DRY-RUN (Simulation)'.cyan.bold : '🔥 LIVE UPLOAD TO R2'.green.bold}`);
  console.log(`R2 Bucket:      ${BUCKET_NAME}`);
  console.log(`R2 Public Host: ${R2_DOMAIN}`);
  console.log(`Concurrency:    ${CONCURRENCY} parallel worker streams`);
  if (RUN_LIMIT !== Infinity) console.log(`Limit:          ${RUN_LIMIT} images max`);
  console.log(`Timestamp:      ${new Date().toISOString()}`);

  console.log('\n[Step 1]: Connecting to MongoDB to harvest distinct external URLs...'.white);
  await mongoose.connect(MONGO_URI);
  const coll = mongoose.connection.db.collection('importedquestions');

  const qUrls = await coll.distinct('imageUrl', {
    imageUrl: { $regex: /storage\.googleapis\.com\/memoneet/i },
  });
  const eUrls = await coll.distinct('explanationImageUrl', {
    explanationImageUrl: { $regex: /storage\.googleapis\.com\/memoneet/i },
  });

  const distinctUrls = Array.from(new Set([...qUrls, ...eUrls])).filter(Boolean);
  console.log(`✅ [Harvest Complete]: Found ${distinctUrls.length} distinct external GCS images`.green.bold);
  console.log(`   - Question Diagrams (q_image):     ${qUrls.length}`);
  console.log(`   - Explanation Diagrams (e_image):  ${eUrls.length}`);

  await mongoose.disconnect();

  const existingMap = loadExistingMappings();
  console.log(`ℹ️  [Resume Cache]: Found ${existingMap.size} previously mapped images in ${path.basename(MAPPING_FILE)}`.cyan);

  const pendingUrls = distinctUrls.filter((url) => !existingMap.has(url));
  const targetUrls = pendingUrls.slice(0, RUN_LIMIT);
  console.log(`🎯 [Execution Queue]: ${targetUrls.length} pending images to migrate (Skipped ${distinctUrls.length - pendingUrls.length} already mapped)\n`.yellow.bold);

  if (targetUrls.length === 0) {
    console.log('🎉 All external images are already migrated to R2 and mapped! Nothing to do.'.green.bold);
    return;
  }

  const mappingStream = fs.createWriteStream(MAPPING_FILE, { flags: 'a' });
  const failedStream = fs.createWriteStream(FAILED_FILE, { flags: 'a' });

  const stats = {
    total: targetUrls.length,
    success: 0,
    alreadyInR2: 0,
    uploaded: 0,
    failed: 0,
    bytesUploaded: 0,
  };

  const startTime = Date.now();
  let cursor = 0;

  async function worker(workerId) {
    while (cursor < targetUrls.length && !isShuttingDown) {
      const idx = cursor++;
      const originalUrl = targetUrls[idx];
      const r2Key = getR2KeyFromGcsUrl(originalUrl);
      const r2Url = `${R2_DOMAIN}/${r2Key}`;

      if (IS_DRY_RUN) {
        stats.success++;
        stats.uploaded++;
        const pct = (((idx + 1) / targetUrls.length) * 100).toFixed(1);
        if ((idx + 1) % 100 === 0 || idx + 1 === targetUrls.length) {
          process.stdout.write(`\r  [DRY-RUN] Processed ${idx + 1}/${targetUrls.length} (${pct}%) | Target Key: ${r2Key.slice(0, 45)}...`);
        }
        continue;
      }

      try {
        const existsOnR2 = await checkR2ObjectExists(r2Key);
        if (existsOnR2) {
          stats.alreadyInR2++;
          stats.success++;
          mappingStream.write(JSON.stringify({
            originalUrl,
            r2Key,
            r2Url,
            status: 'ALREADY_EXISTS',
            timestamp: new Date().toISOString(),
          }) + '\n');
        } else {
          // Download stream from GCS
          const response = await axios({
            method: 'GET',
            url: originalUrl,
            responseType: 'stream',
            timeout: 20000,
            headers: {
              'User-Agent': 'NEETForge-R2-Migrator/2.0',
            },
          });

          const contentType = response.headers['content-type'] || getContentType(r2Key);
          const contentLength = parseInt(response.headers['content-length'] || '0', 10);

          // Upload stream directly to R2
          const parallelUpload = new Upload({
            client: r2,
            params: {
              Bucket: BUCKET_NAME,
              Key: r2Key,
              Body: response.data,
              ContentType: contentType,
              CacheControl: 'public, max-age=31536000, immutable',
            },
          });

          await parallelUpload.done();

          stats.uploaded++;
          stats.success++;
          stats.bytesUploaded += contentLength;

          mappingStream.write(JSON.stringify({
            originalUrl,
            r2Key,
            r2Url,
            contentType,
            contentLength,
            status: 'UPLOADED',
            timestamp: new Date().toISOString(),
          }) + '\n');
        }
      } catch (err) {
        stats.failed++;
        console.error(`\n❌ [Worker ${workerId} Error] Failed: ${originalUrl} -> ${err.message}`.red);
        failedStream.write(JSON.stringify({
          originalUrl,
          r2Key,
          error: err.message,
          timestamp: new Date().toISOString(),
        }) + '\n');
      }

      const completed = stats.success + stats.failed;
      if (completed % 25 === 0 || completed === targetUrls.length) {
        const pct = ((completed / targetUrls.length) * 100).toFixed(1);
        const elapsedSec = ((Date.now() - startTime) / 1000) || 0.001;
        const rate = (completed / elapsedSec).toFixed(1);
        const mbUploaded = (stats.bytesUploaded / (1024 * 1024)).toFixed(1);

        const remainingSec = Math.max(0, Math.round((targetUrls.length - completed) / (parseFloat(rate) || 1)));
        const etaM = Math.floor(remainingSec / 60);
        const etaS = remainingSec % 60;
        const etaStr = `${etaM}m ${etaS < 10 ? '0' : ''}${etaS}s`;

        const barWidth = 20;
        const filled = Math.min(barWidth, Math.round((completed / targetUrls.length) * barWidth));
        const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, barWidth - filled));

        const sub = r2Key.includes('biology') ? 'Biology' : r2Key.includes('chemistry') ? 'Chemistry' : r2Key.includes('physics') ? 'Physics' : 'General';
        const filename = path.basename(r2Key);
        const timeNow = new Date().toLocaleTimeString('en-IN', { hour12: false });

        console.log(`[${timeNow}] [${bar}] ${pct.padStart(5)}% (${completed}/${targetUrls.length}) | ${sub} (${filename}) | ${rate} img/s | ${mbUploaded} MB | ETA: ${etaStr}`);
      }
    }
  }

  const workers = [];
  for (let w = 1; w <= CONCURRENCY; w++) {
    workers.push(worker(w));
  }

  await Promise.all(workers);
  process.stdout.write('\n');

  mappingStream.end();
  failedStream.end();

  const totalTimeSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n======================================================================'.cyan.bold);
  console.log('                 MIGRATION RUN EXECUTION SUMMARY                      '.cyan.bold);
  console.log('======================================================================'.cyan.bold);
  console.log(`Execution Mode:         ${IS_DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`Duration:               ${totalTimeSec}s`);
  console.log(`Total Target Queue:     ${stats.total}`);
  console.log(`Successfully Processed: ${stats.success}`.green);
  console.log(`Newly Uploaded to R2:   ${stats.uploaded}`);
  console.log(`Already Present in R2:  ${stats.alreadyInR2}`);
  console.log(`Failed Transfers:       ${stats.failed}`.red);
  console.log(`Data Transferred:       ${(stats.bytesUploaded / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Mapping File Generated: ${MAPPING_FILE}`.white.bold);
  if (stats.failed > 0) {
    console.log(`Failed Log File:        ${FAILED_FILE}`.yellow.bold);
  }
  console.log('======================================================================\n'.cyan.bold);
}

main().catch((err) => {
  console.error('\n❌ Fatal Migration Exception:', err);
  process.exit(1);
});
