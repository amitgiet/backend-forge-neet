require('dotenv').config();
const fs = require('fs');
const readline = require('readline');
const mongoose = require('mongoose');
const ChapterResource = require('../src/models/ChapterResource');

/**
 * Sync Notes Image Updates
 * Reads a .jsonl map file, updates MongoDB with the new URLs,
 * and deletes the old files from Google Drive.
 */

const DEFAULT_CONCURRENCY = 10;
const DEFAULT_TIMEOUT_MS = 30_000;

const parseArgs = () => {
  const args = process.argv.slice(2);
  const getValue = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
  };
  return {
    mapFile: args[0], // First positional arg
    dryRun: args.includes('--dry-run'),
    concurrency: parseInt(getValue('--concurrency') || DEFAULT_CONCURRENCY),
    timeoutMs: parseInt(getValue('--timeout') || DEFAULT_TIMEOUT_MS),
  };
};

const withTimeout = (promise, ms, errorMessage) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

const ensureAccessToken = async () => {
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Missing Drive API credentials in .env');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await response.json();
  if (!data.access_token) {
    throw new Error(`Failed to refresh access token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
};

const deleteDriveFile = async ({ fileId, accessToken, timeoutMs }) => {
  if (!fileId) return;
  const response = await withTimeout(
    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    timeoutMs,
    `Timed out while deleting Drive file: ${fileId}`
  );

  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Failed to delete Drive file ${fileId}: ${text}`);
  }
};

const runWithConcurrency = async (items, concurrency, worker) => {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
};

const run = async () => {
  const { mapFile, dryRun, concurrency, timeoutMs } = parseArgs();

  if (!mapFile || !fs.existsSync(mapFile)) {
    console.error('Usage: node scripts/syncNotesImageUpdates.js <path-to-map-file.jsonl> [--dry-run]');
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing');
  
  let accessToken = null;
  if (!dryRun) {
    try {
      accessToken = await ensureAccessToken();
      console.log('Successfully refreshed Google Drive access token for deletions.');
    } catch (e) {
      console.warn(`[WARN] Drive API error: ${e.message}. Script will continue with MongoDB updates ONLY.`);
    }
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to MongoDB. dryRun=${dryRun}, concurrency=${concurrency}`);

  const lines = fs.readFileSync(mapFile, 'utf8').split('\n').filter(Boolean);
  const queue = lines.map(line => JSON.parse(line));
  console.log(`Loaded ${queue.length} records from ${mapFile}`);

  let successCount = 0;
  let failCount = 0;

  await runWithConcurrency(queue, concurrency, async (item, index) => {
    const { chapterResourceId, pageId, newUrl, newDriveId, oldDriveId } = item;
    try {
      if (dryRun) {
        console.log(`[DRY-RUN] Would update ${chapterResourceId}:${pageId} and delete ${oldDriveId}`);
      } else {
        // 1. Update MongoDB
        const result = await ChapterResource.updateOne(
          { _id: chapterResourceId, 'notes.pageFiles.pageId': pageId },
          {
            $set: {
              'notes.pageFiles.$.driveLink': newUrl,
              'notes.pageFiles.$.driveId': newDriveId
            }
          }
        );

        if (result.matchedCount === 0) {
           console.warn(`[WARN] No matching record found for ${chapterResourceId} page ${pageId}`);
        }

        // 2. Delete Old File from Drive (if token is available)
        if (accessToken && oldDriveId && oldDriveId !== newDriveId) {
          try {
            await deleteDriveFile({ fileId: oldDriveId, accessToken, timeoutMs });
            console.log(`[OK] Updated ${pageId} and deleted old Drive file ${oldDriveId}`);
          } catch (e) {
            console.warn(`[WARN] DB updated for ${pageId}, but Drive deletion failed: ${e.message}`);
          }
        } else {
          console.log(`[OK] Updated ${pageId} DB record.`);
        }
      }
      successCount++;
    } catch (error) {
      failCount++;
      console.error(`[ERROR] Failed for ${chapterResourceId}:${pageId}: ${error.message}`);
    }

    if ((index + 1) % 10 === 0 || (index + 1) === queue.length) {
      console.log(`Progress: ${index + 1}/${queue.length} ... Success: ${successCount}, Failed: ${failCount}`);
    }
  });

  console.log(`\nSync completed. Success: ${successCount}, Failed: ${failCount}`);
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('Sync failed:', error.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
