'use strict';

/**
 * doubtController.js
 * ─────────────────────────────────────────────────────────────
 * GET    /api/v1/doubts                   — paginated list with filters
 * POST   /api/v1/doubts                   — create a new doubt
 * GET    /api/v1/doubts/:id               — single doubt + answers
 * PUT    /api/v1/doubts/:id               — edit doubt (owner only)
 * DELETE /api/v1/doubts/:id               — delete doubt (owner only)
 * POST   /api/v1/doubts/:id/upvote        — toggle upvote on doubt
 * POST   /api/v1/doubts/:id/answer        — add an answer
 * POST   /api/v1/doubts/:id/answers/:aid/upvote  — toggle upvote on answer
 * PUT    /api/v1/doubts/:id/answers/:aid/accept  — accept answer (owner)
 * PUT    /api/v1/doubts/:id/answers/:aid/verify  — admin verify answer
 * PUT    /api/v1/doubts/:id/resolve        — mark resolved (owner)
 */

const Doubt = require('../models/Doubt');

const VALID_SUBJECTS = ['biology', 'chemistry', 'physics', 'general'];
const PAGE_SIZE = 20;

// ── List doubts ──────────────────────────────────────────────────────────────
exports.listDoubts = async (req, res) => {
    try {
        const { subject, chapterId, isResolved, search, page = '1', limit } = req.query;
        const lim = Math.min(50, Math.max(1, parseInt(limit || String(PAGE_SIZE), 10)));
        const skip = (Math.max(1, parseInt(page, 10)) - 1) * lim;

        const filter = { isHidden: { $ne: true } };
        if (subject && VALID_SUBJECTS.includes(subject)) filter.subject = subject;
        if (chapterId) filter.chapterId = String(chapterId);
        if (isResolved === 'true') filter.isResolved = true;
        if (isResolved === 'false') filter.isResolved = false;
        if (search && search.trim().length >= 2) {
            const esc = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.$or = [
                { title: { $regex: esc, $options: 'i' } },
                { body: { $regex: esc, $options: 'i' } },
            ];
        }

        const [total, doubts] = await Promise.all([
            Doubt.countDocuments(filter),
            Doubt.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(lim)
                .select('-answers.upvotedBy -upvotedBy')
                .populate('userId', 'name avatar')
                .lean(),
        ]);

        res.json({
            success: true,
            pagination: { page: parseInt(page, 10), limit: lim, total, totalPages: Math.ceil(total / lim) },
            data: doubts.map((d) => ({ ...d, answerCount: d.answers?.length ?? 0, answers: undefined })),
        });
    } catch (err) {
        console.error('listDoubts error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ── Create doubt ─────────────────────────────────────────────────────────────
exports.createDoubt = async (req, res) => {
    try {
        const { title, body, subject = 'general', chapterId, topic, tags, imageUrl } = req.body;
        if (!title?.trim() || !body?.trim()) {
            return res.status(400).json({ success: false, error: 'Title and body are required' });
        }

        const doubt = await Doubt.create({
            userId: req.user.id,
            title: title.trim(),
            body: body.trim(),
            imageUrl: imageUrl || '',
            subject: VALID_SUBJECTS.includes(subject) ? subject : 'general',
            chapterId: chapterId || '',
            topic: topic || '',
            tags: Array.isArray(tags) ? tags.slice(0, 8).map(String) : [],
        });

        res.status(201).json({ success: true, data: doubt });
    } catch (err) {
        console.error('createDoubt error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ── Get single doubt ─────────────────────────────────────────────────────────
exports.getDoubt = async (req, res) => {
    try {
        const doubt = await Doubt.findById(req.params.id)
            .populate('userId', 'name avatar')
            .populate('answers.userId', 'name avatar')
            .lean();
        if (!doubt || doubt.isHidden) return res.status(404).json({ success: false, error: 'Doubt not found' });

        // Increment view count (non-blocking)
        Doubt.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }).exec();

        res.json({ success: true, data: doubt });
    } catch (err) {
        console.error('getDoubt error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ── Edit doubt (owner only) ──────────────────────────────────────────────────
exports.updateDoubt = async (req, res) => {
    try {
        const doubt = await Doubt.findById(req.params.id);
        if (!doubt) return res.status(404).json({ success: false, error: 'Doubt not found' });
        if (String(doubt.userId) !== String(req.user.id)) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        const { title, body, subject, chapterId, topic, tags, imageUrl } = req.body;
        if (title) doubt.title = title.trim();
        if (body) doubt.body = body.trim();
        if (imageUrl !== undefined) doubt.imageUrl = imageUrl;
        if (subject && VALID_SUBJECTS.includes(subject)) doubt.subject = subject;
        if (chapterId !== undefined) doubt.chapterId = chapterId;
        if (topic !== undefined) doubt.topic = topic;
        if (Array.isArray(tags)) doubt.tags = tags.slice(0, 8).map(String);

        await doubt.save();
        res.json({ success: true, data: doubt });
    } catch (err) {
        console.error('updateDoubt error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ── Delete doubt (owner only) ────────────────────────────────────────────────
exports.deleteDoubt = async (req, res) => {
    try {
        const doubt = await Doubt.findById(req.params.id);
        if (!doubt) return res.status(404).json({ success: false, error: 'Doubt not found' });
        if (String(doubt.userId) !== String(req.user.id)) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }
        await doubt.deleteOne();
        res.json({ success: true, message: 'Doubt deleted' });
    } catch (err) {
        console.error('deleteDoubt error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ── Toggle upvote on doubt ───────────────────────────────────────────────────
exports.toggleDoubtUpvote = async (req, res) => {
    try {
        const doubt = await Doubt.findById(req.params.id);
        if (!doubt) return res.status(404).json({ success: false, error: 'Doubt not found' });

        const uid = req.user.id;
        const hasUpvoted = doubt.upvotedBy.some((id) => String(id) === String(uid));

        if (hasUpvoted) {
            doubt.upvotedBy.pull(uid);
            doubt.upvotes = Math.max(0, doubt.upvotes - 1);
        } else {
            doubt.upvotedBy.push(uid);
            doubt.upvotes += 1;
        }

        await doubt.save();
        res.json({ success: true, data: { upvotes: doubt.upvotes, upvoted: !hasUpvoted } });
    } catch (err) {
        console.error('toggleDoubtUpvote error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ── Add answer ────────────────────────────────────────────────────────────────
exports.addAnswer = async (req, res) => {
    try {
        const { body, imageUrl } = req.body;
        if (!body?.trim()) return res.status(400).json({ success: false, error: 'Answer body is required' });

        const doubt = await Doubt.findById(req.params.id);
        if (!doubt || doubt.isHidden) return res.status(404).json({ success: false, error: 'Doubt not found' });

        doubt.answers.push({ userId: req.user.id, body: body.trim(), imageUrl: imageUrl || '' });
        await doubt.save();

        const newAnswer = doubt.answers[doubt.answers.length - 1];
        res.status(201).json({ success: true, data: newAnswer });
    } catch (err) {
        console.error('addAnswer error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ── Toggle upvote on answer ──────────────────────────────────────────────────
exports.toggleAnswerUpvote = async (req, res) => {
    try {
        const doubt = await Doubt.findById(req.params.id);
        if (!doubt) return res.status(404).json({ success: false, error: 'Doubt not found' });

        const answer = doubt.answers.id(req.params.aid);
        if (!answer) return res.status(404).json({ success: false, error: 'Answer not found' });

        const uid = req.user.id;
        const hasUpvoted = answer.upvotedBy.some((id) => String(id) === String(uid));

        if (hasUpvoted) {
            answer.upvotedBy.pull(uid);
            answer.upvotes = Math.max(0, answer.upvotes - 1);
        } else {
            answer.upvotedBy.push(uid);
            answer.upvotes += 1;
        }

        await doubt.save();
        res.json({ success: true, data: { upvotes: answer.upvotes, upvoted: !hasUpvoted } });
    } catch (err) {
        console.error('toggleAnswerUpvote error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ── Accept answer (owner) ─────────────────────────────────────────────────────
exports.acceptAnswer = async (req, res) => {
    try {
        const doubt = await Doubt.findById(req.params.id);
        if (!doubt) return res.status(404).json({ success: false, error: 'Doubt not found' });
        if (String(doubt.userId) !== String(req.user.id)) {
            return res.status(403).json({ success: false, error: 'Only the doubt author can accept an answer' });
        }

        // Clear previous accepted answer
        doubt.answers.forEach((a) => { a.isAccepted = false; });
        const answer = doubt.answers.id(req.params.aid);
        if (!answer) return res.status(404).json({ success: false, error: 'Answer not found' });

        answer.isAccepted = true;
        doubt.isResolved = true;
        await doubt.save();

        res.json({ success: true, data: { answerId: answer._id, isResolved: true } });
    } catch (err) {
        console.error('acceptAnswer error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ── Admin verify answer ───────────────────────────────────────────────────────
exports.verifyAnswer = async (req, res) => {
    try {
        const doubt = await Doubt.findById(req.params.id);
        if (!doubt) return res.status(404).json({ success: false, error: 'Doubt not found' });
        const answer = doubt.answers.id(req.params.aid);
        if (!answer) return res.status(404).json({ success: false, error: 'Answer not found' });

        answer.isVerified = !answer.isVerified;
        await doubt.save();
        res.json({ success: true, data: { isVerified: answer.isVerified } });
    } catch (err) {
        console.error('verifyAnswer error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ── Resolve doubt (owner) ─────────────────────────────────────────────────────
exports.resolveDoubt = async (req, res) => {
    try {
        const doubt = await Doubt.findById(req.params.id);
        if (!doubt) return res.status(404).json({ success: false, error: 'Doubt not found' });
        if (String(doubt.userId) !== String(req.user.id)) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        doubt.isResolved = !doubt.isResolved;
        await doubt.save();
        res.json({ success: true, data: { isResolved: doubt.isResolved } });
    } catch (err) {
        console.error('resolveDoubt error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};
