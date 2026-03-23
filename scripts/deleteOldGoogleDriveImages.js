require('dotenv').config();
const fs = require('fs');

const ensureAccessToken = async () => {
  const direct = String(process.env.GOOGLE_DRIVE_ACCESS_TOKEN || process.env.AC || '').trim();
  if (direct) return direct;

  const refreshToken = String(process.env.GOOGLE_DRIVE_REFRESH_TOKEN || '').trim();
  const clientId = String(process.env.GOOGLE_DRIVE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_DRIVE_CLIENT_SECRET || '').trim();

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Missing Google auth env');
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

const deleteDriveFile = async (fileId, accessToken) => {
  if (!fileId) return;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    throw new Error(`Failed to delete ${fileId} (${response.status}): ${errorText}`);
  }
};

const run = async () => {
  const mapFile = process.argv[2];
  if (!mapFile || !fs.existsSync(mapFile)) {
    throw new Error(`Missing or invalid map file: ${mapFile}`);
  }

  console.log('Refreshing Google token...');
  const accessToken = await ensureAccessToken();

  console.log(`Reading map file: ${mapFile}`);
  const content = fs.readFileSync(mapFile, 'utf8');
  const lines = content.split(/\r?\n/).filter(Boolean);

  let successCount = 0;
  let notFoundCount = 0;
  let failCount = 0;

  for (let i = 0; i < lines.length; i++) {
    try {
      const data = JSON.parse(lines[i]);
      if (data.oldDriveFileId) {
        await deleteDriveFile(data.oldDriveFileId, accessToken);
        successCount++;
        if (i % 50 === 0) console.log(`Processed ${i}/${lines.length}...`);
      } else {
        notFoundCount++;
      }
    } catch (err) {
      console.error(`Error processing line ${i}: ${err.message}`);
      failCount++;
    }
    
    // gentle rate limit
    await new Promise(res => setTimeout(res, 200));
  }

  console.log('--- Summary ---');
  console.log(`Total rows: ${lines.length}`);
  console.log(`Successfully deleted: ${successCount}`);
  console.log(`No oldDriveFileId (skipped): ${notFoundCount}`);
  console.log(`Failed: ${failCount}`);
};

run().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
