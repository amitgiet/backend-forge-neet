const ImportedCurriculum = require('../models/ImportedCurriculum');
const ImportedQuestion = require('../models/ImportedQuestion');

// ── GET /api/v1/curriculum/subjects ─────────────────────────────────────────
// Returns the 3 available subject keys
exports.getSubjectList = async (req, res) => {
    try {
        res.json({
            success: true,
            data: ['biology', 'chemistry', 'physics'],
        });
    } catch (err) {
        console.error('getSubjectList error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ── GET /api/v1/curriculum/:subject/chapters ─────────────────────────────────
// Returns all chapter documents for a subject (lean, without the full topics array)
exports.getAllChapters = async (req, res) => {
    try {
        const { subject } = req.params;
        const validSubjects = ['biology', 'chemistry', 'physics'];
        if (!validSubjects.includes(subject.toLowerCase())) {
            return res.status(400).json({
                success: false,
                error: `Invalid subject. Must be one of: ${validSubjects.join(', ')}`,
            });
        }

        const chapters = await ImportedCurriculum.find(
            { subject: subject.toLowerCase() },
            { _id: 1, subject: 1, type: 1, isHidden: 1, order: 1 }
        )
            .sort({ order: 1 })
            .lean();

        res.json({ success: true, count: chapters.length, data: chapters });
    } catch (err) {
        console.error('getAllChapters error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ── GET /api/v1/curriculum/:subject/chapters/:chapterId/topics ───────────────
// Returns the topics array for a specific chapter (without sub_topics.uids for a lighter response)
exports.getTopicsByChapter = async (req, res) => {
    try {
        const { subject, chapterId } = req.params;

        const chapter = await ImportedCurriculum.findOne(
            { _id: chapterId, subject: subject.toLowerCase() },
            { 'topics.topic': 1, 'topics.sub_topics.subTopic': 1 }
        ).lean();

        if (!chapter) {
            return res.status(404).json({
                success: false,
                error: 'Chapter not found',
            });
        }

        res.json({ success: true, chapterId, data: chapter.topics });
    } catch (err) {
        console.error('getTopicsByChapter error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ── GET /api/v1/curriculum/:subject/chapters/:chapterId/subtopics ─────────────
// Query param: ?topic=<topic name>
// Returns all sub_topics for the given topic inside a chapter (includes uid counts)
exports.getSubTopics = async (req, res) => {
    try {
        const { subject, chapterId } = req.params;
        const topicName = req.query.topic;

        const matchFilter = { _id: chapterId, subject: subject.toLowerCase() };

        const chapter = await ImportedCurriculum.findOne(matchFilter).lean();

        if (!chapter) {
            return res.status(404).json({ success: false, error: 'Chapter not found' });
        }

        let topics = chapter.topics;

        // Filter by topic name if provided
        if (topicName) {
            topics = topics.filter(
                (t) => t.topic.toLowerCase() === topicName.toLowerCase()
            );
            if (topics.length === 0) {
                return res.status(404).json({ success: false, error: 'Topic not found' });
            }
        }

        // Build response with uid counts instead of raw uid arrays (for performance)
        const result = topics.map((t) => ({
            topic: t.topic,
            sub_topics: t.sub_topics.map((st) => ({
                subTopic: st.subTopic,
                uid_count: st.uids.length,
                hidden_uid_count: (st.hidden_uids || []).length,
                uids: st.uids,
                hidden_uids: st.hidden_uids,
                video: st.video,
                notes: st.notes,
            })),
        }));

        res.json({ success: true, chapterId, data: result });
    } catch (err) {
        console.error('getSubTopics error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ── GET /api/v1/curriculum/questions ─────────────────────────────────────────
// Query params: uids=10101,10102,... (comma-separated) | page=1 | limit=20
// Fetches questions from ImportedQuestion by uid list (maintains uid order)
exports.getQuestionsByUIDs = async (req, res) => {
    try {
        const { uids, page = 1, limit = 20 } = req.query;

        if (!uids) {
            return res.status(400).json({ success: false, error: 'uids query param is required' });
        }

        const uidList = uids
            .split(',')
            .map((u) => u.trim())
            .filter(Boolean);

        if (uidList.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid uids provided' });
        }

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        // Paginate over the uid list, then fetch
        const paginatedUIDs = uidList.slice(skip, skip + limitNum);

        // Fetch from ImportedQuestion (questionId is stored as a String)
        const questions = await ImportedQuestion.find({
            questionId: { $in: paginatedUIDs.map(String) },
        }).lean();

        // Restore original uid order
        const questionMap = {};
        questions.forEach((q) => { questionMap[q.questionId] = q; });
        const ordered = paginatedUIDs.map((uid) => questionMap[String(uid)] || null).filter(Boolean);

        res.json({
            success: true,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: uidList.length,
                totalPages: Math.ceil(uidList.length / limitNum),
            },
            data: ordered,
        });
    } catch (err) {
        console.error('getQuestionsByUIDs error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};
