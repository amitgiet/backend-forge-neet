require('dotenv').config();
const fs = require('fs');

/**
 * Delete Old Drive Images
 * Reads a .jsonl map file, extracts old Google Drive file IDs,
 * and deletes them concurrently to speed up the process.
 */

const DEFAULT_CONCURRENCY = 50; // High concurrency for fast deletion
const DEFAULT_TIMEOUT_MS = 30_000;

const parseArgs = () => {
  const args = process.argv.slice(2);
  const getValue = (flag, def) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : def;
  };
  return {
    mapFile: args[0], // First positional arg
    dryRun: args.includes('--dry-run'),
    concurrency: parseInt(getValue('--concurrency', DEFAULT_CONCURRENCY)),
    timeoutMs: parseInt(getValue('--timeout', DEFAULT_TIMEOUT_MS)),
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
  // If the user pasted a fresh Access Token directly, we can just use it immediately.
  const directAccessToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    if (directAccessToken && directAccessToken.startsWith('ya29.')) {
      console.log('Using direct Access Token from .env');
      return directAccessToken;
    }
    throw new Error('Missing Drive API credentials in .env');
  }

  try {
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
       throw new Error(JSON.stringify(data));
    }
    return data.access_token;
  } catch (error) {
    if (directAccessToken && directAccessToken.startsWith('ya29.')) {
      console.log('Refresh token failed, but a direct Access Token was found in .env. Using it directly.');
      return directAccessToken;
    }
    throw new Error(`Failed to refresh access token: ${error.message}`);
  }
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
    console.error('Usage: node scripts/deleteOldDriveFiles.js <path-to-map-file.jsonl> [--dry-run]');
    process.exit(1);
  }

  let accessToken = null;
  if (!dryRun) {
    accessToken = await ensureAccessToken();
    console.log('Successfully refreshed Google Drive access token.');
  }

  // Extract unique old Drive IDs from the map file
  const lines = fs.readFileSync(mapFile, 'utf8').split('\n').filter(Boolean);
  const driveIdsSet = new Set();
  
  lines.forEach(line => {
    try {
      const parsed = JSON.parse(line);
      if (parsed.oldDriveId && parsed.newDriveId && parsed.oldDriveId !== parsed.newDriveId) {
        driveIdsSet.add(parsed.oldDriveId);
      }
    } catch (e) {}
  });

  const driveIds = Array.from(driveIdsSet);
  console.log(`Found ${driveIds.length} unique old Drive files to delete from ${mapFile}`);

  if (driveIds.length === 0) {
    console.log('Nothing to delete. Exiting.');
    return;
  }

  let successCount = 0;
  let failCount = 0;
  let notFoundCount = 0;

  console.log(`Starting deletion with concurrency=${concurrency}...`);

  await runWithConcurrency(driveIds, concurrency, async (fileId, index) => {
    try {
      if (dryRun) {
        // Just print in dry run
        console.log(`[DRY-RUN] Would delete Drive file ${fileId}`);
      } else {
        await deleteDriveFile({ fileId, accessToken, timeoutMs });
        successCount++;
      }
    } catch (error) {
      if (error.message.includes('404')) {
        notFoundCount++;
      } else {
        failCount++;
        console.error(`[ERROR] Failed to delete file ${fileId}: ${error.message}`);
      }
    }

    if ((index + 1) % 50 === 0 || (index + 1) === driveIds.length) {
      if (!dryRun) {
        console.log(`Progress: ${index + 1}/${driveIds.length} ... Deleted: ${successCount}, Already Deleted/404: ${notFoundCount}, Failed: ${failCount}`);
      }
    }
  });

  console.log(`\nDeletion completed.`);
  if (!dryRun) {
    console.log(`Deleted successfully: ${successCount}`);
    console.log(`Already deleted (404): ${notFoundCount}`);
    console.log(`Failed to delete: ${failCount}`);
  }
};

run().catch((error) => {
  console.error('Process failed:', error.message);
  process.exit(1);
});
