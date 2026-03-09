'use strict';

/**
 * analyticsController.js
 * ─────────────────────────────────────────────────────────────
 * GET /api/v1/analytics/subject-accuracy  → per-subject accuracy stats
 * GET /api/v1/analytics/accuracy-trend    → weekly accuracy over last N weeks
 * GET /api/v1/analytics/weakness-heatmap  → per-chapter accuracy grid
 */

const TestAttempt = require('../models/TestAttempt');
const ImportedSubtopicAttempt = require('../models/ImportedSubtopicAttempt');

// ── helpers ───────────────────────────────────────────────────────────────────

const startOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
};

const SUBJECTS = ['biology', 'chemistry', 'physics'];

// ── GET /api/v1/analytics/subject-accuracy ────────────────────────────────────
exports.getSubjectAccuracy = async (req, res) => {
    try {
        const userId = req.user.id;

        // Aggregate all completed TestAttempts for this user
        const attempts = await TestAttempt.find(
            { userId, status: 'COMPLETED' },
            { 'results.subjectWise': 1, createdAt: 1 }
        ).lean();

        // Also pull curriculum quiz attempts (ImportedSubtopicAttempt) if available
        const subtopicAttempts = await ImportedSubtopicAttempt.find(
            { userId },
            { subject: 1, correctAnswers: 1, totalQuestions: 1 }
        ).lean();

        // Accumulate per-subject totals
        const totals = {
            biology: { correct: 0, total: 0 },
            chemistry: { correct: 0, total: 0 },
            physics: { correct: 0, total: 0 },
        };

        for (const attempt of attempts) {
            const sw = attempt.results?.subjectWise;
            if (!sw) continue;
            for (const subj of SUBJECTS) {
                if (sw[subj]) {
                    totals[subj].correct += Number(sw[subj].correct || 0);
                    totals[subj].total += Number(sw[subj].total || 0);
                }
            }
        }

        // Merge curriculum quiz attempts
        for (const sa of subtopicAttempts) {
            const subj = String(sa.subject || '').toLowerCase();
            if (totals[subj]) {
                totals[subj].correct += Number(sa.correctAnswers || 0);
                totals[subj].total += Number(sa.totalQuestions || 0);
            }
        }

        const data = SUBJECTS.map((subj) => {
            const { correct, total } = totals[subj];
            return {
                subject: subj,
                correct,
                total,
                accuracy: total > 0 ? Math.round((correct / total) * 100) : null,
            };
        });

        const grandTotal = data.reduce((s, d) => s + d.total, 0);
        const grandCorrect = data.reduce((s, d) => s + d.correct, 0);

        res.json({
            success: true,
            data: {
                overall: {
                    correct: grandCorrect,
                    total: grandTotal,
                    accuracy: grandTotal > 0 ? Math.round((grandCorrect / grandTotal) * 100) : null,
                },
                subjects: data,
            },
        });
    } catch (err) {
        console.error('getSubjectAccuracy error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ── GET /api/v1/analytics/accuracy-trend ─────────────────────────────────────
exports.getAccuracyTrend = async (req, res) => {
    try {
        const userId = req.user.id;
        const weeks = Math.min(12, Math.max(4, parseInt(req.query.weeks || '8', 10)));

        const since = new Date();
        since.setDate(since.getDate() - weeks * 7);

        const attempts = await TestAttempt.find(
            { userId, status: 'COMPLETED', createdAt: { $gte: since } },
            { 'score.correct': 1, 'score.attempted': 1, createdAt: 1 }
        ).lean();

        // Bucket by ISO week
        const buckets = {};
        for (const attempt of attempts) {
            const weekStart = startOfWeek(attempt.createdAt).toISOString().slice(0, 10);
            if (!buckets[weekStart]) buckets[weekStart] = { correct: 0, attempted: 0 };
            buckets[weekStart].correct += Number(attempt.score?.correct || 0);
            buckets[weekStart].attempted += Number(attempt.score?.attempted || 0);
        }

        // Build ordered array of last N weeks
        const trend = [];
        for (let i = weeks - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i * 7);
            const key = startOfWeek(d).toISOString().slice(0, 10);
            const label = new Date(key).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
            const b = buckets[key] || { correct: 0, attempted: 0 };
            trend.push({
                week: key,
                label,
                correct: b.correct,
                attempted: b.attempted,
                accuracy: b.attempted > 0 ? Math.round((b.correct / b.attempted) * 100) : null,
            });
        }

        res.json({ success: true, data: { weeks: trend } });
    } catch (err) {
        console.error('getAccuracyTrend error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ── GET /api/v1/analytics/weakness-heatmap ───────────────────────────────────
exports.getWeaknessHeatmap = async (req, res) => {
    try {
        const userId = req.user.id;
        const subject = req.query.subject
            ? String(req.query.subject).toLowerCase()
            : null;

        const filter = { userId, status: 'COMPLETED' };
        const attempts = await TestAttempt.find(
            filter,
            { 'results.chapterWise': 1 }
        ).lean();

        // Also pull curriculum subtopic attempts for richer chapter data
        const saFilter = { userId };
        if (subject) saFilter.subject = subject;
        const subtopicAttempts = await ImportedSubtopicAttempt.find(
            saFilter,
            { subject: 1, chapterId: 1, correctAnswers: 1, totalQuestions: 1, percentage: 1 }
        ).lean();

        // Accumulate per-chapter
        const chapters = {};

        const addChapter = (key, subj, correct, total) => {
            if (!key) return;
            if (!chapters[key]) chapters[key] = { chapterId: key, subject: subj, correct: 0, total: 0 };
            chapters[key].correct += correct;
            chapters[key].total += total;
        };

        for (const attempt of attempts) {
            const cw = attempt.results?.chapterWise;
            if (!cw) continue;
            if (Array.isArray(cw)) {
                for (const c of cw) {
                    if (subject && c.subject !== subject) continue;
                    addChapter(c.chapterId || c.chapter, c.subject, Number(c.correct || 0), Number(c.total || 0));
                }
            } else if (typeof cw === 'object') {
                for (const [key, val] of Object.entries(cw)) {
                    addChapter(key, val.subject || subject, Number(val.correct || 0), Number(val.total || 0));
                }
            }
        }

        for (const sa of subtopicAttempts) {
            const key = sa.chapterId || 'Unknown';
            const subj = String(sa.subject || subject || '').toLowerCase();
            addChapter(key, subj, Number(sa.correctAnswers || 0), Number(sa.totalQuestions || 0));
        }

        // Convert to sorted array
        const heatmap = Object.values(chapters)
            .map((c) => ({
                ...c,
                accuracy: c.total > 0 ? Math.round((c.correct / c.total) * 100) : null,
            }))
            .filter((c) => !subject || c.subject === subject)
            .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101)); // weakest first

        res.json({ success: true, data: { chapters: heatmap, total: heatmap.length } });
    } catch (err) {
        console.error('getWeaknessHeatmap error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};
