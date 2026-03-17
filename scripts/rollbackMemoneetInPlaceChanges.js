require('dotenv').config();
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const MockTest = require('../src/models/MockTest');

const LOG_DIR = path.join(__dirname, 'logs');
const MARKER_PATH = path.join(LOG_DIR, 'memoneet-processed-fileids.txt');
const TIMEOUT_MS = 120_000;

const FIELD_TO_RAW_MIRROR = {
  'resources.questionPdf': 'source.raw.questionPaperPdfUrl',
  'resources.answerPdf': 'source.raw.answerKeyPdfUrl',
  'resources.hindiQuestionPdf': 'source.raw.hindiQuestionPaperPdfUrl',
  'resources.hindiAnswerPdf': 'source.raw.hindiAnswerKeyPdfUrl'
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
    throw new Error('Missing Google auth env. Provide GOOGLE_DRIVE_ACCESS_TOKEN, or refresh token flow vars');
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

const listRevisions = async (fileId, accessToken) => {
  const response = await withTimeout(
    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/revisions?fields=revisions(id,modifiedTime)&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }),
    TIMEOUT_MS,
    `Timed out listing revisions: ${fileId}`
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Revision list failed (${response.status}): ${JSON.stringify(data)}`);
  }

  const revs = Array.isArray(data.revisions) ? data.revisions : [];
  revs.sort((a, b) => new Date(a.modifiedTime).getTime() - new Date(b.modifiedTime).getTime());
  return revs;
};

const downloadRevision = async (fileId, revisionId, accessToken) => {
  const response = await withTimeout(
    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/revisions/${revisionId}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }),
    TIMEOUT_MS,
    `Timed out downloading revision ${revisionId} for ${fileId}`
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Revision download failed (${response.status}): ${body.slice(0, 300)}`);
  }

  return Buffer.from(await response.arrayBuffer());
};

const patchDriveFile = async (fileId, buffer, accessToken) => {
  const response = await withTimeout(
    fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/pdf'
      },
      body: buffer
    }),
    TIMEOUT_MS,
    `Timed out patching file ${fileId}`
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Drive patch failed (${response.status}): ${body.slice(0, 300)}`);
  }
};

const loadPatchedRows = () => {
  if (!fs.existsSync(LOG_DIR)) return [];
  const files = fs.readdirSync(LOG_DIR).filter((f) => /^memoneet-inplace-success-.*\.jsonl$/.test(f));
  const rows = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(LOG_DIR, file), 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean);
    for (const ln of lines) {
      try {
        const row = JSON.parse(ln);
        if (row && row.patched === true && row.fileId && row.testObjectId && row.fieldPath && row.oldUrl) {
          rows.push(row);
        }
      } catch (_) {}
    }
  }

  return rows;
};

const run = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing');

  const rows = loadPatchedRows();
  if (!rows.length) {
    console.log('No patched rows found in memoneet success logs. Nothing to rollback.');
    return;
  }

  const rowsByFileId = new Map();
  for (const row of rows) {
    if (!rowsByFileId.has(row.fileId)) rowsByFileId.set(row.fileId, []);
    rowsByFileId.get(row.fileId).push(row);
  }

  const accessToken = await ensureAccessToken();

  const rollbackLogStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rollbackLogPath = path.join(LOG_DIR, `memoneet-rollback-${rollbackLogStamp}.jsonl`);
  const rollbackSummaryPath = path.join(LOG_DIR, `memoneet-rollback-summary-${rollbackLogStamp}.json`);

  let filesRestored = 0;
  let filesFailed = 0;
  const restoredFileIds = new Set();

  for (const [fileId] of rowsByFileId.entries()) {
    try {
      const revs = await listRevisions(fileId, accessToken);
      if (revs.length < 2) {
        throw new Error('Not enough revisions to rollback');
      }
      const previous = revs[revs.length - 2];
      const previousBuffer = await downloadRevision(fileId, previous.id, accessToken);
      await patchDriveFile(fileId, previousBuffer, accessToken);

      filesRestored += 1;
      restoredFileIds.add(fileId);
      await fsp.appendFile(rollbackLogPath, `${JSON.stringify({ fileId, status: 'restored', revisionId: previous.id, revisionModifiedTime: previous.modifiedTime })}\n`);
    } catch (error) {
      filesFailed += 1;
      await fsp.appendFile(rollbackLogPath, `${JSON.stringify({ fileId, status: 'failed', error: error.message })}\n`);
    }
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const updatesByTestId = new Map();
  for (const row of rows) {
    const patch = updatesByTestId.get(row.testObjectId) || {};
    patch[row.fieldPath] = row.oldUrl;

    const rawPath = FIELD_TO_RAW_MIRROR[row.fieldPath];
    if (rawPath) {
      patch[rawPath] = row.oldUrl;
    }

    updatesByTestId.set(row.testObjectId, patch);
  }

  let matchedCount = 0;
  let modifiedCount = 0;
  if (updatesByTestId.size) {
    const ops = [];
    for (const [testObjectId, patch] of updatesByTestId.entries()) {
      ops.push({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(testObjectId) },
          update: { $set: patch }
        }
      });
    }
    const result = await MockTest.bulkWrite(ops, { ordered: false });
    matchedCount = Number(result.matchedCount || 0);
    modifiedCount = Number(result.modifiedCount || 0);
  }

  await mongoose.disconnect();

  if (fs.existsSync(MARKER_PATH) && restoredFileIds.size) {
    const original = fs.readFileSync(MARKER_PATH, 'utf8').split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
    const filtered = original.filter((id) => !restoredFileIds.has(id));
    fs.writeFileSync(MARKER_PATH, filtered.length ? `${filtered.join('\n')}\n` : '');
  }

  const summary = {
    totalPatchedRowsFromLogs: rows.length,
    uniqueFilesInLogs: rowsByFileId.size,
    filesRestored,
    filesFailed,
    testsUpdated: updatesByTestId.size,
    matchedCount,
    modifiedCount,
    rollbackLogPath,
    rollbackSummaryPath
  };

  await fsp.writeFile(rollbackSummaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log('Rollback summary:', summary);
};

run().catch(async (error) => {
  console.error('Rollback failed:', error.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
