const PYQMarkedNCERT = require('../models/PYQMarkedNCERT');
const http = require('http');
const https = require('https');

const toHttpsUrl = (rawUrl) => {
  const value = String(rawUrl || '').trim();
  if (!value) return value;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
      return parsed.toString();
    }
    return parsed.toString();
  } catch {
    return value.replace(/^http:\/\//i, 'https://');
  }
};

const ALLOWED_PYQ_HOSTS = new Set(['216.48.182.197']);
const normalizeOrigin = (value) => String(value || '').trim().replace(/\/+$/, '');

const downloadHtmlOnce = (urlString, redirectCount = 0) => new Promise((resolve, reject) => {
  if (redirectCount > 5) {
    return reject(new Error('Too many redirects while fetching PYQ HTML'));
  }

  let parsed;
  try {
    parsed = new URL(urlString);
  } catch (error) {
    return reject(new Error('Invalid PYQ URL'));
  }

  const client = parsed.protocol === 'https:' ? https : http;
  const req = client.request(parsed, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'text/html,*/*',
      'Connection': 'close'
    }
  }, (response) => {
    const statusCode = response.statusCode || 0;

    if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
      const redirectUrl = new URL(response.headers.location, parsed).toString();
      response.resume();
      return resolve(downloadHtmlOnce(redirectUrl, redirectCount + 1));
    }

    if (statusCode < 200 || statusCode >= 300) {
      response.resume();
      return reject(new Error(`Upstream returned ${statusCode}`));
    }

    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => {
      resolve({
        buffer: Buffer.concat(chunks),
        headers: response.headers,
        finalUrl: parsed.toString(),
      });
    });
    response.on('error', reject);
  });

  req.setTimeout(15000, () => {
    req.destroy(new Error('PYQ HTML fetch timeout'));
  });
  req.on('error', reject);
  req.end();
});

const downloadHtmlWithFallback = async (urlString) => {
  try {
    return await downloadHtmlOnce(urlString, 0);
  } catch (error) {
    const parsed = new URL(urlString);
    // If https fails for known host, fallback to http automatically.
    if (parsed.protocol === 'https:' && ALLOWED_PYQ_HOSTS.has(parsed.hostname)) {
      parsed.protocol = 'http:';
      return downloadHtmlOnce(parsed.toString(), 0);
    }
    throw error;
  }
};

// Get all PYQ topics for a subject (with optional stream filter for biology)
exports.getTopicsBySubject = async (req, res) => {
  try {
    const { subject, stream } = req.query;

    if (!subject) {
      return res.status(400).json({
        success: false,
        message: 'Subject parameter is required'
      });
    }

    const query = { subject: subject.toLowerCase() };

    // For biology, optionally filter by stream
    if (subject.toLowerCase() === 'biology' && stream) {
      query.stream = stream.toLowerCase();
    }

    const topics = await PYQMarkedNCERT.find(query)
      .sort({ order: 1 })
      .select('_id topicName url stream isAvailable order');

    const normalizedTopics = topics.map((item) => ({
      _id: item._id,
      topicName: item.topicName,
      url: item.url,
      stream: item.stream,
      isAvailable: item.isAvailable,
      order: item.order,
    }));

    res.status(200).json({
      success: true,
      data: {
        subject,
        stream: stream || null,
        topics: normalizedTopics,
        totalTopics: normalizedTopics.length
      }
    });
  } catch (error) {
    console.error('Error fetching PYQ topics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching PYQ topics',
      error: error.message
    });
  }
};

// Get all subjects with their topics organized
exports.getAllPYQData = async (req, res) => {
  try {
    const pythonData = await PYQMarkedNCERT.find().sort({ subject: 1, stream: 1, order: 1 });

    const organized = {
      physics: [],
      chemistry: [],
      biology: {
        botany: [],
        zoology: []
      }
    };

    pythonData.forEach(item => {
      if (item.subject === 'physics') {
        organized.physics.push({
          _id: item._id,
          topicName: item.topicName,
          url: item.url,
          isAvailable: item.isAvailable
        });
      } else if (item.subject === 'chemistry') {
        organized.chemistry.push({
          _id: item._id,
          topicName: item.topicName,
          url: item.url,
          isAvailable: item.isAvailable
        });
      } else if (item.subject === 'biology') {
        if (item.stream === 'botany') {
          organized.biology.botany.push({
            _id: item._id,
            topicName: item.topicName,
            url: item.url,
            isAvailable: item.isAvailable
          });
        } else if (item.stream === 'zoology') {
          organized.biology.zoology.push({
            _id: item._id,
            topicName: item.topicName,
            url: item.url,
            isAvailable: item.isAvailable
          });
        }
      }
    });

    res.status(200).json({
      success: true,
      data: organized
    });
  } catch (error) {
    console.error('Error fetching all PYQ data:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching PYQ data',
      error: error.message
    });
  }
};

// Get a specific topic by ID
exports.getTopicById = async (req, res) => {
  try {
    const { topicId } = req.params;

    const topic = await PYQMarkedNCERT.findById(topicId);

    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        ...topic.toObject(),
        url: topic.url,
      }
    });
  } catch (error) {
    console.error('Error fetching topic:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching topic',
      error: error.message
    });
  }
};

// Proxy PYQ HTML for HTTPS-safe iframe rendering.
exports.proxyPyqHtml = async (req, res) => {
  try {
    const rawUrl = req.query.url;
    if (!rawUrl) {
      return res.status(400).json({ success: false, message: 'url query param is required' });
    }

    let parsed;
    try {
      parsed = new URL(String(rawUrl));
    } catch (error) {
      return res.status(400).json({ success: false, message: 'Invalid url' });
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ success: false, message: 'Only http/https URLs are allowed' });
    }
    if (!ALLOWED_PYQ_HOSTS.has(parsed.hostname)) {
      return res.status(403).json({ success: false, message: 'URL host is not allowed' });
    }

    const upstream = await downloadHtmlWithFallback(parsed.toString());
    const contentType = String(upstream.headers['content-type'] || 'text/html; charset=utf-8');
    let html = upstream.buffer.toString('utf8');

    const baseHref = (() => {
      const finalParsed = new URL(upstream.finalUrl);
      finalParsed.pathname = finalParsed.pathname.replace(/[^/]*$/, '');
      finalParsed.search = '';
      finalParsed.hash = '';
      return finalParsed.toString();
    })();
    const upstreamOrigin = new URL(upstream.finalUrl).origin;

    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`);
    } else {
      html = `<head><base href="${baseHref}"></head>${html}`;
    }

    // Remove embedded CSP meta tags from upstream HTML so proxy response policy controls framing.
    html = html.replace(
      /<meta[^>]+http-equiv=["']content-security-policy["'][^>]*>/gi,
      ''
    );

    // Rewrite root-relative URLs so they resolve to upstream origin instead of backend origin.
    html = html.replace(
      /\b(src|href|action)=["']\/(?!\/)/gi,
      `$1="${upstreamOrigin}/`
    );

    const allowedFrameAncestors = [
      "'self'",
      'http://localhost:8080',
      'http://localhost:3000',
      'http://localhost:5173',
      normalizeOrigin(process.env.FRONTEND_URL),
      normalizeOrigin(process.env.FRONTEND_URL_PROD)
    ].filter(Boolean);

    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', `frame-ancestors ${allowedFrameAncestors.join(' ')};`);
    res.setHeader('Content-Type', contentType.includes('text/html') ? 'text/html; charset=utf-8' : contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(html);
  } catch (error) {
    console.error('Error proxying PYQ HTML:', error);
    return res.status(502).json({
      success: false,
      message: 'Failed to fetch PYQ content from upstream',
      error: error.message
    });
  }
};

// Admin: Add new PYQ topic
exports.addTopic = async (req, res) => {
  try {
    const { subject, stream, topicName, url } = req.body;

    if (!subject || !topicName || !url) {
      return res.status(400).json({
        success: false,
        message: 'Subject, topic name, and URL are required'
      });
    }

    const topic = await PYQMarkedNCERT.create({
      subject: subject.toLowerCase(),
      stream: stream ? stream.toLowerCase() : null,
      topicName,
      url
    });

    res.status(201).json({
      success: true,
      message: 'Topic added successfully',
      data: topic
    });
  } catch (error) {
    console.error('Error adding topic:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding topic',
      error: error.message
    });
  }
};

// Admin: Update topic
exports.updateTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const updates = req.body;

    const topic = await PYQMarkedNCERT.findByIdAndUpdate(topicId, updates, {
      new: true,
      runValidators: true
    });

    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Topic updated successfully',
      data: topic
    });
  } catch (error) {
    console.error('Error updating topic:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating topic',
      error: error.message
    });
  }
};

// Admin: Delete topic
exports.deleteTopic = async (req, res) => {
  try {
    const { topicId } = req.params;

    const topic = await PYQMarkedNCERT.findByIdAndDelete(topicId);

    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Topic deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting topic:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting topic',
      error: error.message
    });
  }
};
