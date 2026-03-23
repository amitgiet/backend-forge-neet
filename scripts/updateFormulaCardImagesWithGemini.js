require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const FormulaCard = require('../src/models/FormulaCard');

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview';
const DEFAULT_PROMPT = "You are an assistant that enhances educational formula images to make them clearer and more visually appealing, while preserving the original content. Improve the image by enhancing contrast, cleaning up artifacts, and making text more legible. Do not alter the mathematical expressions or diagrams in a way that changes their meaning. The goal is to produce a clearer version of the same formula image.";

const CONTENT_TYPE_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const has = (flag) => args.includes(flag);
  const getValue = (flag, fallback) => {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx + 1 >= args.length) return fallback;
    return args[idx + 1];
  };

  const limit = Number(getValue('--limit', 0));
  const concurrency = Number(getValue('--concurrency', DEFAULT_CONCURRENCY));
  const timeoutMs = Number(getValue('--timeout-ms', DEFAULT_TIMEOUT_MS));

  return {
    dryRun: has('--dry-run'),
    force: has('--force'),
    apply: has('--apply'),
    retryFile: String(getValue('--retry-file', '') || '').trim(),
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0,
    concurrency: Number.isFinite(concurrency) && concurrency > 0 ? Math.floor(concurrency) : DEFAULT_CONCURRENCY,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.floor(timeoutMs) : DEFAULT_TIMEOUT_MS,
    subject: String(getValue('--subject', '') || '').trim(),
    chapter: String(getValue('--chapter', '') || '').trim(),
    topic: String(getValue('--topic', '') || '').trim(),
    prompt: String(getValue('--prompt', DEFAULT_PROMPT) || DEFAULT_PROMPT).trim(),
    model: String(getValue('--model', DEFAULT_MODEL) || DEFAULT_MODEL).trim()
  };
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

const ensureLogDir = () => {
  const dir = path.join(__dirname, 'logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const isGoogleDriveUrl = (urlValue) => {
  const url = String(urlValue || '').toLowerCase();
  return url.includes('drive.google.com') || url.includes('googleusercontent.com');
};

const extractDriveFileId = (urlValue = '') => {
  const url = String(urlValue || '').trim();
  if (!url) return null;

  const byQuery = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (byQuery?.[1]) return byQuery[1];

  const byPath = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (byPath?.[1]) return byPath[1];

  return null;
};

const ensureAccessToken = async () => {
  const direct = String(process.env.GOOGLE_DRIVE_ACCESS_TOKEN || process.env.AC || '').trim();
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

const downloadImage = async (url, timeoutMs) => {
  const response = await withTimeout(
    fetch(url, {
      headers: {
        'User-Agent': 'NEETForge-Formula-Enhancer/1.0'
      },
      redirect: 'follow'
    }),
    timeoutMs,
    `Timed out while downloading source image: ${url}`
  );

  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }

  const contentType = String(response.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error('Downloaded empty file');
  }

  return { buffer, contentType };
};

const uploadNewDriveFile = async ({ fileName, buffer, contentType, folderId, accessToken, timeoutMs }) => {
  const boundary = `----neetforgeBoundary${Date.now()}`;
  const metadata = {
    name: fileName,
    parents: [folderId]
  };

  const head = Buffer.from(
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([head, buffer, tail]);

  const response = await withTimeout(
    fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name&supportsAllDrives=true', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    }),
    timeoutMs,
    `Timed out while uploading new Drive file: ${fileName}`
  );

  const data = await response.json();
  if (!response.ok || !data.id) {
    throw new Error(`Drive upload failed: ${JSON.stringify(data)}`);
  }
  return data;
};

const makeDriveFilePublic = async ({ fileId, accessToken, timeoutMs }) => {
  const response = await withTimeout(
    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    }),
    timeoutMs,
    `Timed out while setting public permission for file: ${fileId}`
  );

  if (!response.ok) {
    const data = await response.text();
    throw new Error(`Failed to set file public: ${data}`);
  }
};

const buildPublicUrl = (fileId) => `https://drive.google.com/uc?export=view&id=${fileId}`;

const sanitizeFilePart = (value, fallback = 'untitled') =>
  String(value || fallback)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80) || fallback;

const generateImprovedImageWithGemini = async ({
  apiKey,
  model,
  prompt,
  imageBuffer,
  mimeType,
  timeoutMs
}) => {
  const response = await withTimeout(
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: imageBuffer.toString('base64')
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE']
        }
      })
    }),
    timeoutMs,
    'Timed out while waiting for Gemini image generation'
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Gemini image generation failed: ${JSON.stringify(payload)}`);
  }

  const candidateParts = payload?.candidates?.flatMap((candidate) => candidate?.content?.parts || []) || [];
  const imagePart = candidateParts.find((part) => part?.inlineData?.data || part?.inline_data?.data);
  const inline = imagePart?.inlineData || imagePart?.inline_data;

  if (!inline?.data) {
    const textPart = candidateParts.find((part) => typeof part?.text === 'string');
    throw new Error(`Gemini returned no image data${textPart?.text ? `: ${textPart.text}` : ''}`);
  }

  const outMime = String(inline.mimeType || inline.mime_type || 'image/png').trim();
  return {
    buffer: Buffer.from(inline.data, 'base64'),
    contentType: outMime
  };
};

const runWithConcurrency = async (items, concurrency, worker) => {
  const results = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
};

const run = async () => {
  const {
    dryRun,
    force,
    apply,
    retryFile,
    limit,
    concurrency,
    timeoutMs,
    subject,
    chapter,
    topic,
    prompt,
    model
  } = parseArgs();

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing');
  }
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required');
  }

  const folderId = String(process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
  if (!folderId) {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID is required');
  }

  const accessToken = await ensureAccessToken();

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to MongoDB. dryRun=${dryRun}, force=${force}, concurrency=${concurrency}, limit=${limit || 'all'}`);

  const query = {
    imgUrl: { $exists: true, $ne: '' }
  };
  if (subject) query.subjectTitle = subject;
  if (chapter) query.chapterTitle = chapter;
  if (topic) query.topicTitle = topic;

  const cards = await FormulaCard.find(query).sort({ _id: 1 }).lean();

  let filterIds = null;
  if (retryFile) {
    if (!fs.existsSync(retryFile)) {
      throw new Error(`Retry file not found: ${retryFile}`);
    }
    const content = fs.readFileSync(retryFile, 'utf8');
    filterIds = content.split('\n').filter(Boolean).map(line => {
      try {
        const parsed = JSON.parse(line);
        return parsed.cardId;
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
    console.log(`Found ${filterIds.length} valid card IDs in retry file.`);
  }

  const selected = cards.filter((card) => {
    if (filterIds) {
      return filterIds.includes(String(card._id));
    }
    if (force) return true;
    return true;
  });
  const queue = limit > 0 ? selected.slice(0, limit) : selected;

  const logDir = ensureLogDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const mapLogPath = path.join(logDir, `formula-image-gemini-map-${stamp}.jsonl`);
  const errorLogPath = path.join(logDir, `formula-image-gemini-errors-${stamp}.jsonl`);
  const pendingMongoPath = path.join(logDir, `formula-image-gemini-pending-mongo-${stamp}.json`);

  let updated = 0;
  let failed = 0;
  let skipped = cards.length - queue.length;
  let processed = 0;
  const pendingMongoUpdates = [];

  await runWithConcurrency(queue, concurrency, async (card, index) => {
    const oldUrl = String(card.imgUrl || '').trim();
    const oldDriveFileId = extractDriveFileId(oldUrl);

    try {
      const source = await downloadImage(oldUrl, timeoutMs);
      const improved = await generateImprovedImageWithGemini({
        apiKey: process.env.GEMINI_API_KEY,
        model,
        prompt,
        imageBuffer: source.buffer,
        mimeType: source.contentType,
        timeoutMs
      });

      const ext = CONTENT_TYPE_TO_EXT[improved.contentType] || 'png';
      const fileName = [
        sanitizeFilePart(card.subjectTitle, 'subject'),
        sanitizeFilePart(card.chapterTitle, 'chapter'),
        sanitizeFilePart(card.topicTitle, 'topic'),
        sanitizeFilePart(card.title, 'card'),
        `${String(card._id)}-enhanced-${Date.now()}.${ext}`
      ].join(' - ');

      let newDriveFileId = null;
      let finalUrl = oldUrl;
      let modeUsed = 'dry-run-upload-new';

      if (!dryRun) {
        const uploaded = await uploadNewDriveFile({
          fileName,
          buffer: improved.buffer,
          contentType: improved.contentType,
          folderId,
          accessToken,
          timeoutMs
        });
        await makeDriveFilePublic({
          fileId: uploaded.id,
          accessToken,
          timeoutMs
        });

        newDriveFileId = uploaded.id;
        finalUrl = buildPublicUrl(uploaded.id);
        modeUsed = oldDriveFileId ? 'drive-upload-new-preserve-old' : 'drive-upload-new-from-non-drive';

        pendingMongoUpdates.push({
          cardId: String(card._id),
          oldUrl,
          newUrl: finalUrl,
          oldDriveFileId: oldDriveFileId || null,
          newDriveFileId
        });
      }

      fs.appendFileSync(
        mapLogPath,
        `${JSON.stringify({
          cardId: String(card._id),
          title: card.title,
          subjectTitle: card.subjectTitle,
          chapterTitle: card.chapterTitle,
          topicTitle: card.topicTitle,
          oldUrl,
          oldDriveFileId: oldDriveFileId || null,
          newDriveFileId,
          newUrl: finalUrl,
          uploadedFileName: fileName,
          mode: modeUsed,
          originalPreserved: true
        })}\n`
      );

      updated += 1;
      processed += 1;
      if ((index + 1) % 10 === 0 || index === queue.length - 1) {
        console.log(`Processed ${index + 1}/${queue.length} ... updated=${updated}, failed=${failed}`);
      }
    } catch (error) {
      failed += 1;
      processed += 1;
      fs.appendFileSync(
        errorLogPath,
        `${JSON.stringify({
          cardId: String(card._id),
          title: card.title,
          oldUrl,
          error: error.message
        })}\n`
      );
      console.error(`Failed for card ${card._id}: ${error.message}`);
    }
  });

  fs.writeFileSync(
    pendingMongoPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        dryRun,
        totalQueued: queue.length,
        failed,
        updates: pendingMongoUpdates
      },
      null,
      2
    )
  );

  if (!dryRun) {
    if (apply) {
      console.log(`\nApplying ${pendingMongoUpdates.length} updates to MongoDB...`);
      for (const update of pendingMongoUpdates) {
        await FormulaCard.updateOne(
          { _id: new mongoose.Types.ObjectId(update.cardId) },
          { $set: { imgUrl: update.newUrl } }
        );
      }
      console.log('MongoDB updates applied successfully.');
    } else {
      console.log(`MongoDB updates were not applied automatically. Review and apply later from ${pendingMongoPath}`);
    }
  }

  console.log('--- Formula image Gemini update summary ---');
  console.log({
    totalCards: cards.length,
    queued: queue.length,
    processed,
    updated,
    skipped,
    failed,
    dryRun,
    concurrency,
    mapLogPath,
    errorLogPath,
    pendingMongoPath
  });

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('Formula image Gemini update failed:', error.message);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
