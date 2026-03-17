require('dotenv').config();
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const { PDFDocument, PDFName, PDFDict, PDFNumber, rgb } = require('pdf-lib');
const MockTest = require('../src/models/MockTest');

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_BATCH_SIZE = 6;
const MIN_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 8;
const DEFAULT_CONCURRENCY = 3;
const MAX_CONCURRENCY = 6;

const PDF_FIELDS = [
  { fieldPath: 'resources.questionPdf', kind: 'question_en', rawMirrorPath: 'source.raw.questionPaperPdfUrl' },
  { fieldPath: 'resources.answerPdf', kind: 'answer_en', rawMirrorPath: 'source.raw.answerKeyPdfUrl' },
  { fieldPath: 'resources.hindiQuestionPdf', kind: 'question_hi', rawMirrorPath: 'source.raw.hindiQuestionPaperPdfUrl' },
  { fieldPath: 'resources.hindiAnswerPdf', kind: 'answer_hi', rawMirrorPath: 'source.raw.hindiAnswerKeyPdfUrl' }
];

const parseArgs = () => {
  const args = process.argv.slice(2);
  const has = (flag) => args.includes(flag);
  const getValue = (flag, fallback) => {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx + 1 >= args.length) return fallback;
    return args[idx + 1];
  };

  const batchSizeRaw = Number(getValue('--batch-size', DEFAULT_BATCH_SIZE));
  const offsetRaw = Number(getValue('--offset', 0));
  const concurrencyRaw = Number(getValue('--concurrency', DEFAULT_CONCURRENCY));
  const timeoutRaw = Number(getValue('--timeout-ms', DEFAULT_TIMEOUT_MS));

  const testIds = String(getValue('--test-ids', ''))
    .split(',')
    .map((v) => String(v || '').trim())
    .filter(Boolean);

  const batchSizeFinite = Number.isFinite(batchSizeRaw) ? Math.floor(batchSizeRaw) : DEFAULT_BATCH_SIZE;
  const batchSize = Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, batchSizeFinite));

  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
  const concurrencyFinite = Number.isFinite(concurrencyRaw) ? Math.floor(concurrencyRaw) : DEFAULT_CONCURRENCY;
  const concurrency = Math.min(MAX_CONCURRENCY, Math.max(1, concurrencyFinite));
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? Math.floor(timeoutRaw) : DEFAULT_TIMEOUT_MS;

  return {
    dryRun: has('--dry-run'),
    force: has('--force'),
    noBrandingMask: has('--no-branding-mask'),
    batchSize,
    offset,
    concurrency,
    timeoutMs,
    testIds
  };
};

const getValueByPath = (obj, dottedPath) =>
  dottedPath.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);

const setValueByPath = (target, dottedPath, value) => {
  const keys = dottedPath.split('.');
  let ptr = target;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (!ptr[key] || typeof ptr[key] !== 'object') ptr[key] = {};
    ptr = ptr[key];
  }
  ptr[keys[keys.length - 1]] = value;
};

const normalizeUrlValue = (value = '') => String(value || '').trim().replace(/\s+/g, '');

const extractDriveFileId = (urlValue = '') => {
  const cleaned = normalizeUrlValue(urlValue);
  if (!cleaned) return null;

  if (/^[a-zA-Z0-9_-]{15,}$/.test(cleaned)) return cleaned;

  let parsed;
  try {
    parsed = new URL(cleaned);
  } catch (_) {
    return null;
  }

  const idByQuery = parsed.searchParams.get('id');
  if (idByQuery) return idByQuery;

  const pathMatch = parsed.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (pathMatch?.[1]) return pathMatch[1];

  const filePathMatch = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (filePathMatch?.[1]) return filePathMatch[1];

  return null;
};

const buildCanonicalDriveUrl = (fileId) => `https://drive.google.com/uc?export=view&id=${fileId}`;

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
    throw new Error(
      'Missing Google auth env. Provide GOOGLE_DRIVE_ACCESS_TOKEN, or GOOGLE_DRIVE_REFRESH_TOKEN + GOOGLE_DRIVE_CLIENT_ID + GOOGLE_DRIVE_CLIENT_SECRET'
    );
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

const downloadDrivePdfByFileId = async (fileId, accessToken, timeoutMs) => {
  const response = await withTimeout(
    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/pdf,*/*'
      }
    }),
    timeoutMs,
    `Timed out while downloading Drive file: ${fileId}`
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Drive download failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error('Downloaded empty PDF');
  }

  return buffer;
};

const BRANDING_MASKS = [
  // Hide top-right scanner/app stamp (e.g. "Scanned by ...")
  { xRatio: 0.66, yRatio: 0.955, widthRatio: 0.34, heightRatio: 0.05 },
  // Hide bottom-center company mark text/logo line
  { xRatio: 0.22, yRatio: 0.0, widthRatio: 0.56, heightRatio: 0.11 }
];

const transformPdfBuffer = async (pdfBytes, options = {}) => {
  const applyBrandingMask = options.applyBrandingMask !== false;
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const pageCountBefore = pdfDoc.getPageCount();
  let removedWatermarkObjects = 0;
  let appliedBrandingMasks = 0;

  for (const page of pages) {
    const node = page.node;
    const resources = node.Resources();
    if (!resources) continue;

    const xObjectRef = resources.get(PDFName.of('XObject'));
    if (!xObjectRef) continue;

    let xObjectDict = null;
    try {
      xObjectDict = resources.context.lookup(xObjectRef, PDFDict);
    } catch (_) {
      try {
        const maybe = resources.context.lookup(xObjectRef);
        if (maybe && typeof maybe.keys === 'function') {
          xObjectDict = maybe;
        }
      } catch (_) {}
    }
    if (!xObjectDict || typeof xObjectDict.keys !== 'function') continue;

    for (const key of xObjectDict.keys()) {
      const obj = xObjectDict.lookup(key);
      if (!obj) continue;

      const objectDict =
        typeof obj.get === 'function'
          ? obj
          : obj.dict && typeof obj.dict.get === 'function'
            ? obj.dict
            : null;
      if (!objectDict) continue;

      const subtype = objectDict.get(PDFName.of('Subtype'));
      const width = objectDict.get(PDFName.of('Width'));
      const height = objectDict.get(PDFName.of('Height'));

      const subtypeName = subtype?.decodeText?.() || '';
      const w = width instanceof PDFNumber ? width.asNumber() : null;
      const h = height instanceof PDFNumber ? height.asNumber() : null;

      if (subtypeName === 'Image' && w === 210 && h === 197) {
        xObjectDict.delete(key);
        removedWatermarkObjects += 1;
      }
    }

    if (applyBrandingMask) {
      const { width, height } = page.getSize();
      for (const mask of BRANDING_MASKS) {
        page.drawRectangle({
          x: width * mask.xRatio,
          y: height * mask.yRatio,
          width: width * mask.widthRatio,
          height: height * mask.heightRatio,
          color: rgb(1, 1, 1),
          opacity: 1
        });
        appliedBrandingMasks += 1;
      }
    }
  }

  if (pdfDoc.getPageCount() > 0) {
    pdfDoc.removePage(0);
  }

  const pageCountAfter = pdfDoc.getPageCount();
  if (pageCountAfter <= 0) {
    throw new Error('PDF has zero pages after transform; skipping in-place update');
  }

  const transformedBytes = await pdfDoc.save({ useObjectStreams: false });
  return {
    buffer: Buffer.from(transformedBytes),
    removedWatermarkObjects,
    appliedBrandingMasks,
    pageCountBefore,
    pageCountAfter
  };
};

const patchDrivePdfInPlace = async ({ fileId, pdfBuffer, accessToken, timeoutMs }) => {
  const response = await withTimeout(
    fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/pdf'
      },
      body: pdfBuffer
    }),
    timeoutMs,
    `Timed out while patching Drive file: ${fileId}`
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Drive in-place patch failed (${response.status}): ${body.slice(0, 300)}`);
  }
};

const createLimiter = (concurrency) => {
  let active = 0;
  const queue = [];

  const next = () => {
    if (!queue.length || active >= concurrency) return;
    active += 1;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then((result) => {
        active -= 1;
        resolve(result);
        next();
      })
      .catch((error) => {
        active -= 1;
        reject(error);
        next();
      });
  };

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
};

const ensureLogDir = () => {
  const logDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  return logDir;
};

const readMarkerFile = async (markerPath) => {
  if (!fs.existsSync(markerPath)) return new Set();
  const content = await fsp.readFile(markerPath, 'utf8');
  return new Set(content.split(/\r?\n/).map((v) => v.trim()).filter(Boolean));
};

const run = async () => {
  const startedAt = new Date();
  const { dryRun, force, noBrandingMask, batchSize, offset, concurrency, timeoutMs, testIds } = parseArgs();

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing');
  }

  const accessToken = await ensureAccessToken();
  await mongoose.connect(process.env.MONGODB_URI);

  const query = {
    sourceType: 'memoneet',
    $or: PDF_FIELDS.map((def) => ({ [def.fieldPath]: { $exists: true, $ne: '' } }))
  };

  if (testIds.length) {
    query.testId = { $in: testIds };
  }

  const allMatchingTests = await MockTest.find(query).sort({ _id: 1 }).lean();
  const tests = allMatchingTests.slice(offset, offset + batchSize);

  const logDir = ensureLogDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const successLogPath = path.join(logDir, `memoneet-inplace-success-${stamp}.jsonl`);
  const errorLogPath = path.join(logDir, `memoneet-inplace-errors-${stamp}.jsonl`);
  const summaryLogPath = path.join(logDir, `memoneet-inplace-summary-${stamp}.json`);
  const markerFilePath = path.join(logDir, 'memoneet-processed-fileids.txt');

  const processedMarker = await readMarkerFile(markerFilePath);
  const newlyProcessedFileIds = new Set();

  const jobs = [];
  for (const test of tests) {
    for (const def of PDF_FIELDS) {
      const oldUrlRaw = getValueByPath(test, def.fieldPath);
      const oldUrl = normalizeUrlValue(oldUrlRaw);
      if (!oldUrl) continue;

      const fileId = extractDriveFileId(oldUrl);
      const rawMirrorValue = normalizeUrlValue(getValueByPath(test, def.rawMirrorPath));

      jobs.push({
        testObjectId: String(test._id),
        testId: String(test.testId || ''),
        fieldPath: def.fieldPath,
        kind: def.kind,
        rawMirrorPath: def.rawMirrorPath,
        shouldUpdateRawMirror: rawMirrorValue && rawMirrorValue === oldUrl,
        oldUrl,
        fileId
      });
    }
  }

  const limiter = createLimiter(concurrency);
  const processPromiseByFileId = new Map();

  const getOrCreateFileProcessPromise = (job) => {
    if (!job.fileId) {
      return Promise.reject(new Error(`Could not extract Drive file id from URL: ${job.oldUrl}`));
    }

    if (processPromiseByFileId.has(job.fileId)) {
      return processPromiseByFileId.get(job.fileId);
    }

    const promise = limiter(async () => {
      const canonicalUrl = buildCanonicalDriveUrl(job.fileId);

      if (!force && processedMarker.has(job.fileId)) {
        return {
          fileId: job.fileId,
          canonicalUrl,
          skippedByMarker: true
        };
      }

      if (dryRun) {
        return {
          fileId: job.fileId,
          canonicalUrl,
          dryRun: true
        };
      }

      const originalBuffer = await downloadDrivePdfByFileId(job.fileId, accessToken, timeoutMs);
      const transformResult = await transformPdfBuffer(originalBuffer, {
        applyBrandingMask: !noBrandingMask
      });

      await patchDrivePdfInPlace({
        fileId: job.fileId,
        pdfBuffer: transformResult.buffer,
        accessToken,
        timeoutMs
      });

      newlyProcessedFileIds.add(job.fileId);

      return {
        fileId: job.fileId,
        canonicalUrl,
        bytesBefore: originalBuffer.length,
        bytesAfter: transformResult.buffer.length,
        removedWatermarkObjects: transformResult.removedWatermarkObjects,
        pageCountBefore: transformResult.pageCountBefore,
        pageCountAfter: transformResult.pageCountAfter,
        patched: true
      };
    });

    processPromiseByFileId.set(job.fileId, promise);
    return promise;
  };

  const updatesByTestId = new Map();
  const successRows = [];
  const errorRows = [];

  let fieldsProcessed = 0;
  let fieldsFailed = 0;
  let fieldsSkippedByMarker = 0;

  await Promise.all(
    jobs.map(async (job) => {
      try {
        const result = await getOrCreateFileProcessPromise(job);
        fieldsProcessed += 1;

        if (result.skippedByMarker) fieldsSkippedByMarker += 1;

        const testPatch = updatesByTestId.get(job.testObjectId) || {};
        setValueByPath(testPatch, job.fieldPath, result.canonicalUrl);
        if (job.shouldUpdateRawMirror) {
          setValueByPath(testPatch, job.rawMirrorPath, result.canonicalUrl);
        }
        updatesByTestId.set(job.testObjectId, testPatch);

        successRows.push({
          at: new Date().toISOString(),
          testObjectId: job.testObjectId,
          testId: job.testId,
          fieldPath: job.fieldPath,
          kind: job.kind,
          oldUrl: job.oldUrl,
          fileId: result.fileId,
          newUrl: result.canonicalUrl,
          skippedByMarker: Boolean(result.skippedByMarker),
          dryRun: Boolean(result.dryRun),
          patched: Boolean(result.patched),
          bytesBefore: result.bytesBefore || null,
          bytesAfter: result.bytesAfter || null,
          removedWatermarkObjects: result.removedWatermarkObjects || null,
          appliedBrandingMasks: result.appliedBrandingMasks || null,
          pageCountBefore: result.pageCountBefore || null,
          pageCountAfter: result.pageCountAfter || null
        });
      } catch (error) {
        fieldsFailed += 1;
        errorRows.push({
          at: new Date().toISOString(),
          testObjectId: job.testObjectId,
          testId: job.testId,
          fieldPath: job.fieldPath,
          kind: job.kind,
          oldUrl: job.oldUrl,
          fileId: job.fileId || null,
          error: error.message
        });
      }
    })
  );

  let matchedCount = 0;
  let modifiedCount = 0;

  if (!dryRun && updatesByTestId.size > 0) {
    const bulkOps = [];
    for (const [testObjectId, patch] of updatesByTestId.entries()) {
      bulkOps.push({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(testObjectId) },
          update: { $set: patch }
        }
      });
    }

    const result = await MockTest.bulkWrite(bulkOps, { ordered: false });
    matchedCount = Number(result.matchedCount || 0);
    modifiedCount = Number(result.modifiedCount || 0);
  }

  if (successRows.length) {
    await fsp.writeFile(successLogPath, `${successRows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  } else {
    await fsp.writeFile(successLogPath, '', 'utf8');
  }

  if (errorRows.length) {
    await fsp.writeFile(errorLogPath, `${errorRows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  } else {
    await fsp.writeFile(errorLogPath, '', 'utf8');
  }

  if (!dryRun && newlyProcessedFileIds.size > 0) {
    const markerPayload = `${Array.from(newlyProcessedFileIds).join('\n')}\n`;
    await fsp.appendFile(markerFilePath, markerPayload, 'utf8');
  }

  const summary = {
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    dryRun,
    force,
    sourceType: 'memoneet',
    args: { batchSize, offset, concurrency, timeoutMs, testIds },
    options: {
      applyBrandingMask: !noBrandingMask
    },
    totalMatchingTests: allMatchingTests.length,
    selectedTests: tests.length,
    totalJobs: jobs.length,
    fieldsProcessed,
    fieldsFailed,
    fieldsSkippedByMarker,
    uniqueDriveFilesSeen: processPromiseByFileId.size,
    uniqueDriveFilesPatched: newlyProcessedFileIds.size,
    testsToUpdate: updatesByTestId.size,
    matchedCount,
    modifiedCount,
    logs: {
      successLogPath,
      errorLogPath,
      summaryLogPath,
      markerFilePath
    }
  };

  await fsp.writeFile(summaryLogPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log('--- Memoneet in-place PDF processing summary ---');
  console.log(summary);

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('Processing failed:', error.message);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
