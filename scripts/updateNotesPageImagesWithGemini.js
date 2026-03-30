require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ChapterResource = require('../src/models/ChapterResource');

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_MODEL = 'gemini-2.5-flash-image';
const DEFAULT_PROMPT = "You are an assistant that enhances educational notes page images to make them clearer and more visually appealing, while preserving the original content exactly. Improve clarity, sharpness, contrast, and readability of text and diagrams. Remove compression artifacts and visual noise. Carefully identify and remove a specific background structure describe as : A semi-transparent cloudy or brain type structure is placed in the center of the image, featuring the text “memoneet Line by Line NCERT” in a light purple, handwritten-style font. Behind the text, there is a faint brain illustration in soft pastel shades (yellow and purple), giving it an educational and memory-based theme, replace it with a clean, uniform neutral background. Preserve only the foreground educational material including headings, subheadings, definitions, and diagrams exactly as they appear. Do not change wording, labels, formulas, diagrams, layouts, or meanings. The goal is to produce a cleaner, higher-quality version of the same study page.";

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
    subject: String(getValue('--subject', 'biology') || 'biology').trim().toLowerCase(),
    chapter: String(getValue('--chapter', '') || '').trim(),
    slug: String(getValue('--slug', '') || '').trim(),
    pageId: String(getValue('--page-id', '') || '').trim(),
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

const downloadImage = async ({ url, accessToken, timeoutMs }) => {
  const fileId = extractDriveFileId(url);
  const finalUrl = fileId
    ? `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
    : url;

  const headers = { 'User-Agent': 'NEETForge-Notes-Enhancer/1.0' };
  if (fileId && accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await withTimeout(
    fetch(finalUrl, { headers, redirect: 'follow' }),
    timeoutMs,
    `Timed out while downloading source image: ${finalUrl}`
  );

  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${finalUrl}`);
  }

  const contentType = String(response.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim().toLowerCase();
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

  const outMime = String(inline.mimeType || inline.mime_type || 'image/png').trim().toLowerCase();
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
  const args = parseArgs();
  const { dryRun, force, apply, retryFile, limit, concurrency, timeoutMs, subject, chapter, slug, pageId, prompt, model } = args;

  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing');
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required');

  const folderId = String(process.env.GOOGLE_DRIVE_IMAGES_FOLDER_ID || '').trim();
  if (!folderId) throw new Error('GOOGLE_DRIVE_IMAGES_FOLDER_ID is required');

  const accessToken = await ensureAccessToken();

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to MongoDB. dryRun=${dryRun}, force=${force}, concurrency=${concurrency}, limit=${limit || 'all'}`);

  const query = {
    'notes.mode': 'image_pages',
    'notes.pageFiles.0': { $exists: true }
  };
  if (subject) query.subject = subject;
  if (chapter) query.chapterName = chapter;
  if (slug) query.slug = slug;

  const docs = await ChapterResource.find(query).sort({ chapterName: 1, _id: 1 }).lean();

  let retryKeys = new Set();
  if (retryFile) {
    if (!fs.existsSync(retryFile)) throw new Error(`Retry file not found: ${retryFile}`);
    const content = fs.readFileSync(retryFile, 'utf8');
    content.split('\n').filter(Boolean).forEach(line => {
      try {
        const parsed = JSON.parse(line);
        retryKeys.add(`${parsed.chapterResourceId}::${parsed.pageId}`);
      } catch (e) { }
    });
    console.log(`Found ${retryKeys.size} retry keys.`);
  }

  const fullQueue = [];
  for (const doc of docs) {
    const pageFiles = doc.notes?.pageFiles || [];
    for (const page of pageFiles) {
      const key = `${doc._id}::${page.pageId}`;
      if (retryKeys.size > 0 && !retryKeys.has(key)) continue;
      if (pageId && page.pageId !== pageId) continue;

      const oldUrl = String(page.driveLink || '').trim();
      if (!oldUrl) continue;

      // Skip already enhanced unless force
      if (!force && /notes-enhanced/i.test(oldUrl)) continue;

      fullQueue.push({
        chapterResourceId: String(doc._id),
        subject: doc.subject,
        chapterName: doc.chapterName,
        slug: doc.slug,
        pageId: page.pageId,
        oldUrl,
        oldDriveId: page.driveId || extractDriveFileId(oldUrl)
      });
    }
  }

  const queue = limit > 0 ? fullQueue.slice(0, limit) : fullQueue;
  console.log(`Queue size: ${queue.length} pages (total pages found: ${fullQueue.length})`);

  const logDir = ensureLogDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const mapLogPath = path.join(logDir, `notes-image-gemini-map-${stamp}.jsonl`);
  const errorLogPath = path.join(logDir, `notes-image-gemini-errors-${stamp}.jsonl`);
  const pendingMongoPath = path.join(logDir, `notes-image-gemini-pending-mongo-${stamp}.json`);

  let updated = 0;
  let failed = 0;
  let processed = 0;
  const pendingMongoUpdates = [];

  await runWithConcurrency(queue, concurrency, async (item, index) => {
    try {
      const source = await downloadImage({
        url: item.oldUrl,
        accessToken,
        timeoutMs
      });

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
        sanitizeFilePart(item.subject, 'subject'),
        sanitizeFilePart(item.chapterName, 'chapter'),
        `page-${sanitizeFilePart(item.pageId, 'page')}`,
        `notes-enhanced-${Date.now()}.${ext}`
      ].join(' - ');

      let newDriveFileId = null;
      let finalUrl = item.oldUrl;
      let modeUsed = 'upload-new-preserve-old';

      if (dryRun) {
        modeUsed = 'dry-run-no-upload';
        finalUrl = 'DRY_RUN_PENDING_URL';
        newDriveFileId = 'DRY_RUN_ID';
      } else {
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

        console.log(`[SUCCESS] Page ${item.pageId} Uploaded -> ${finalUrl}`);

        pendingMongoUpdates.push({
          chapterResourceId: item.chapterResourceId,
          pageId: item.pageId,
          oldUrl: item.oldUrl,
          newUrl: finalUrl,
          oldDriveId: item.oldDriveId,
          newDriveId: newDriveFileId
        });
      }

      fs.appendFileSync(mapLogPath, `${JSON.stringify({
        chapterResourceId: item.chapterResourceId,
        chapterName: item.chapterName,
        pageId: item.pageId,
        oldUrl: item.oldUrl,
        newUrl: finalUrl,
        oldDriveId: item.oldDriveId,
        newDriveId: newDriveFileId,
        uploadedFileName: fileName,
        mode: modeUsed
      })}\n`);

      updated += 1;
    } catch (error) {
      failed += 1;
      fs.appendFileSync(errorLogPath, `${JSON.stringify({
        chapterResourceId: item.chapterResourceId,
        pageId: item.pageId,
        oldUrl: item.oldUrl,
        error: error.message
      })}\n`);
      console.error(`Failed for ${item.chapterResourceId} page ${item.pageId}: ${error.message}`);
    } finally {
      processed += 1;
      if (processed % 5 === 0 || processed === queue.length) {
        console.log(`Processed ${processed}/${queue.length} ... updated=${updated}, failed=${failed}`);
      }
    }
  });

  fs.writeFileSync(pendingMongoPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    dryRun,
    totalQueued: queue.length,
    processed,
    updated,
    failed,
    updates: pendingMongoUpdates
  }, null, 2));

  if (!dryRun && apply && pendingMongoUpdates.length > 0) {
    console.log(`\nApplying ${pendingMongoUpdates.length} updates to MongoDB...`);
    for (const update of pendingMongoUpdates) {
      await ChapterResource.updateOne(
        { _id: update.chapterResourceId, 'notes.pageFiles.pageId': update.pageId },
        {
          $set: {
            'notes.pageFiles.$.driveLink': update.newUrl,
            'notes.pageFiles.$.driveId': update.newDriveId
          }
        }
      );
    }
    console.log('MongoDB updates applied successfully.');
  } else if (!dryRun && !apply) {
    console.log(`\nMongoDB updates were NOT applied. Review and run with --apply --limit 0 or similar, or use the pending file.`);
  }

  console.log('--- Notes image Gemini update summary ---');
  console.log({
    totalDocs: docs.length,
    queued: queue.length,
    processed,
    updated,
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
  console.error('Notes image Gemini update failed:', error.message);
  try { await mongoose.disconnect(); } catch (_) { }
  process.exit(1);
});
