const ImportedCurriculum = require('../models/ImportedCurriculum');
const ImportedQuestion = require('../models/ImportedQuestion');
const ImportedSubtopicAttempt = require('../models/ImportedSubtopicAttempt');
const ImportedChallenge = require('../models/Challenge');
const ImportedCurriculumQuizRun = require('../models/ImportedCurriculumQuizRun');
const ToppersResourceLog = require('../models/ToppersResourceLog');
const ToppersResourceReaction = require('../models/ToppersResourceReaction');
const UserQuestion = require('../models/UserQuestion');

const VALID_SUBJECTS = ['biology', 'chemistry', 'physics'];
const RUN_EXPIRY_HOURS = 24;

const makeProgressKey = (topic, subTopic) => `${String(topic)}|||${String(subTopic)}`;
const nowUtc = () => new Date();
const addHours = (date, hours) => new Date(date.getTime() + hours * 60 * 60 * 1000);
const optionIndexToKey = (index) => String.fromCharCode(65 + Number(index));

const sanitizeAnswers = (rawAnswers = [], total = 0) => {
    const targetLength = Math.max(0, Number(total) || 0);
    const answers = Array.isArray(rawAnswers) ? rawAnswers : [];
    const normalized = [];
    for (let i = 0; i < targetLength; i += 1) {
        const value = answers[i];
        if (value === null || value === undefined) {
            normalized.push(-1);
            continue;
        }
        if (typeof value === 'string' && value.trim() === '') {
            normalized.push(-1);
            continue;
        }
        const idx = Number(value);
        normalized.push(Number.isInteger(idx) && idx >= 0 ? idx : -1);
    }
    return normalized;
};

const sanitizeTimes = (rawTimes = [], total = 0) => {
    const targetLength = Math.max(0, Number(total) || 0);
    const times = Array.isArray(rawTimes) ? rawTimes : [];
    const normalized = [];
    for (let i = 0; i < targetLength; i += 1) {
        const value = Number(times[i]);
        normalized.push(Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
    }
    return normalized;
};

const countAttempted = (answers = []) => answers.filter((a) => Number(a) >= 0).length;

const enrollQuestionsInNeuronZ = async (userId, uids = [], answers = [], sourceInfo = {}) => {
    const answeredUids = [];
    for (let idx = 0; idx < uids.length; idx += 1) {
        const answer = Number(answers[idx]);
        if (!Number.isInteger(answer) || answer < 0) continue;
        const uid = uids[idx];
        if (uid === null || uid === undefined) continue;
        answeredUids.push(String(uid));
    }

    if (answeredUids.length === 0) return { enrolled: 0, existing: 0 };
    return UserQuestion.bulkEnroll(userId, answeredUids, sourceInfo);
};

const serializeRun = (runDoc) => {
    const run = runDoc?.toObject ? runDoc.toObject() : runDoc;
    if (!run) return null;
    return {
        runId: String(run._id),
        subject: run.subject,
        chapterId: run.chapterId,
        topic: run.topic,
        subTopic: run.subTopic,
        mode: run.mode,
        status: run.status,
        uids: run.uids || [],
        currentIndex: Number(run.currentIndex || 0),
        answers: Array.isArray(run.answers) ? run.answers.map((a) => (Number(a) >= 0 ? Number(a) : null)) : [],
        questionTimes: Array.isArray(run.questionTimes) ? run.questionTimes.map((t) => Number(t) || 0) : [],
        attemptedQuestions: Number(run.attemptedQuestions || 0),
        elapsedSeconds: Number(run.elapsedSeconds || 0),
        remainingSeconds: run.remainingSeconds === null || run.remainingSeconds === undefined
            ? null
            : Number(run.remainingSeconds),
        resumeCount: Number(run.resumeCount || 0),
        maxResumes: Number(run.maxResumes || 0),
        resumeRemaining: Math.max(0, Number(run.maxResumes || 0) - Number(run.resumeCount || 0)),
        startedAt: run.startedAt || null,
        lastActivityAt: run.lastActivityAt || null,
        expiresAt: run.expiresAt || null,
        submittedAt: run.submittedAt || null,
        abandonedAt: run.abandonedAt || null,
        correctAnswers: Number(run.correctAnswers || 0),
        totalQuestions: Number(run.totalQuestions || (run.uids || []).length || 0),
        percentage: Number(run.percentage || 0),
    };
};

const expireStaleRuns = async (userId) => {
    const filter = {
        status: 'in_progress',
        expiresAt: { $lt: nowUtc() },
    };
    if (userId) filter.userId = userId;
    await ImportedCurriculumQuizRun.updateMany(filter, {
        $set: {
            status: 'expired',
            lastActivityAt: nowUtc(),
        },
    });
};

const getImportedQuestionsByUIDs = async (uids = []) => {
    const uidList = Array.isArray(uids) ? uids.map((u) => String(u)).filter(Boolean) : [];
    if (uidList.length === 0) return [];
    const questionDocs = await ImportedQuestion.find({ questionId: { $in: uidList } }).lean();
    const questionMap = {};
    questionDocs.forEach((q) => {
        questionMap[String(q.questionId)] = q;
    });
    return uidList.map((uid) => questionMap[uid]).filter(Boolean);
};

const isImportedAnswerCorrect = (question, selectedIndex) => {
    if (!question || !Number.isInteger(selectedIndex) || selectedIndex < 0) return false;

    const selectedKey = optionIndexToKey(selectedIndex);
    const correctOption = String(question.correct_option || '').trim().toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(correctOption)) {
        return selectedKey === correctOption;
    }

    const selectedText = String(question.options?.[selectedKey] || '').trim().toLowerCase();
    const correctText = String(question.correct_answer || '').trim().toLowerCase();
    if (!selectedText || !correctText) return false;
    return selectedText === correctText;
};

const evaluateRunScore = (questions = [], answers = []) => {
    let correctAnswers = 0;
    const evaluated = questions.map((question, index) => {
        const selectedIndex = Number(answers[index]);
        const normalized = Number.isInteger(selectedIndex) && selectedIndex >= 0 ? selectedIndex : -1;
        const isCorrect = isImportedAnswerCorrect(question, normalized);
        if (isCorrect) correctAnswers += 1;
        return {
            questionId: String(question.questionId),
            selectedIndex: normalized >= 0 ? normalized : null,
            isCorrect,
        };
    });

    const totalQuestions = questions.length;
    const percentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
    return { correctAnswers, totalQuestions, percentage, evaluated };
};

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

exports.getAllChapters = async (req, res) => {
    try {
        const { subject } = req.params;
        if (!VALID_SUBJECTS.includes(subject.toLowerCase())) {
            return res.status(400).json({
                success: false,
                error: `Invalid subject. Must be one of: ${VALID_SUBJECTS.join(', ')}`,
            });
        }

        const chapters = await ImportedCurriculum.find(
            { subject: subject.toLowerCase() },
            { _id: 1, subject: 1, type: 1, isHidden: 1, order: 1, toppersEssentials: 1 }
        ).sort({ order: 1 }).lean();

        res.json({ success: true, count: chapters.length, data: chapters });
    } catch (err) {
        console.error('getAllChapters error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

exports.getTopicsByChapter = async (req, res) => {
    try {
        const { subject, chapterId } = req.params;

        const chapter = await ImportedCurriculum.findOne(
            { _id: chapterId, subject: subject.toLowerCase() },
            { 'topics.topic': 1, 'topics.sub_topics.subTopic': 1, toppersEssentials: 1 }
        ).lean();

        if (!chapter) {
            return res.status(404).json({ success: false, error: 'Chapter not found' });
        }

        res.json({ success: true, chapterId, toppersEssentials: chapter.toppersEssentials, data: chapter.topics });
    } catch (err) {
        console.error('getTopicsByChapter error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

exports.getSubTopics = async (req, res) => {
    try {
        const { subject, chapterId } = req.params;
        const topicName = req.query.topic;
        const normalizedSubject = String(subject || '').toLowerCase();

        if (!VALID_SUBJECTS.includes(normalizedSubject)) {
            return res.status(400).json({
                success: false,
                error: `Invalid subject. Must be one of: ${VALID_SUBJECTS.join(', ')}`,
            });
        }

        const chapter = await ImportedCurriculum.findOne({ _id: chapterId, subject: normalizedSubject }).lean();
        if (!chapter) {
            return res.status(404).json({ success: false, error: 'Chapter not found' });
        }

        let topics = chapter.topics;
        if (topicName) {
            topics = topics.filter((t) => t.topic.toLowerCase() === String(topicName).toLowerCase());
            if (topics.length === 0) {
                return res.status(404).json({ success: false, error: 'Topic not found' });
            }
        }

        await expireStaleRuns(req.user.id);

        const attempts = await ImportedSubtopicAttempt.find(
            {
                userId: req.user.id,
                subject: normalizedSubject,
                chapterId: String(chapterId),
            },
            { topic: 1, subTopic: 1, percentage: 1, attemptedAt: 1 }
        ).sort({ attemptedAt: -1 }).lean();

        const progressMap = {};
        attempts.forEach((attempt) => {
            const key = makeProgressKey(attempt.topic, attempt.subTopic);
            if (!progressMap[key]) {
                progressMap[key] = {
                    hasTaken: true,
                    attempts: 0,
                    bestScore: 0,
                    lastScore: Number(attempt.percentage || 0),
                    lastAttemptAt: attempt.attemptedAt || null,
                };
            }
            progressMap[key].attempts += 1;
            progressMap[key].bestScore = Math.max(
                Number(progressMap[key].bestScore || 0),
                Number(attempt.percentage || 0)
            );
        });

        const activeRuns = await ImportedCurriculumQuizRun.find(
            {
                userId: req.user.id,
                subject: normalizedSubject,
                chapterId: String(chapterId),
                status: 'in_progress',
            },
            {
                topic: 1,
                subTopic: 1,
                mode: 1,
                attemptedQuestions: 1,
                totalQuestions: 1,
                lastActivityAt: 1,
                expiresAt: 1,
                resumeCount: 1,
                maxResumes: 1,
                uids: 1,
            }
        ).lean();

        const activeRunMap = {};
        activeRuns.forEach((run) => {
            const key = makeProgressKey(run.topic, run.subTopic);
            if (!activeRunMap[key]) {
                activeRunMap[key] = { practice: null, test: null };
            }
            activeRunMap[key][run.mode === 'test' ? 'test' : 'practice'] = {
                runId: String(run._id),
                mode: run.mode,
                attemptedQuestions: Number(run.attemptedQuestions || 0),
                totalQuestions: Number(run.totalQuestions || (run.uids || []).length || 0),
                lastActivityAt: run.lastActivityAt || null,
                expiresAt: run.expiresAt || null,
                resumeRemaining: Math.max(0, Number(run.maxResumes || 0) - Number(run.resumeCount || 0)),
            };
        });

        const result = topics.map((t) => ({
            topic: t.topic,
            sub_topics: t.sub_topics.map((st) => {
                const progress = progressMap[makeProgressKey(t.topic, st.subTopic)] || {
                    hasTaken: false,
                    attempts: 0,
                    bestScore: 0,
                    lastScore: 0,
                    lastAttemptAt: null,
                };
                const activeRunsByMode = activeRunMap[makeProgressKey(t.topic, st.subTopic)] || { practice: null, test: null };
                const activeRun = activeRunsByMode.test || activeRunsByMode.practice || null;

                return {
                    subTopic: st.subTopic,
                    uid_count: st.uids.length,
                    hidden_uid_count: (st.hidden_uids || []).length,
                    uids: st.uids,
                    hidden_uids: st.hidden_uids,
                    video: st.video,
                    notes: st.notes,
                    progress: {
                        hasTaken: Boolean(progress.hasTaken),
                        attempts: Number(progress.attempts || 0),
                        bestScore: Number(progress.bestScore || 0),
                        lastScore: Number(progress.lastScore || 0),
                        lastAttemptAt: progress.lastAttemptAt || null,
                        completed: Number(progress.bestScore || 0) >= 60,
                    },
                    activeRun,
                    activeRuns: activeRunsByMode,
                };
            }),
        }));

        res.json({ success: true, chapterId, toppersEssentials: chapter.toppersEssentials, data: result });
    } catch (err) {
        console.error('getSubTopics error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

exports.startCurriculumRun = async (req, res) => {
    try {
        const {
            subject,
            chapterId,
            topic,
            subTopic,
            mode = 'practice',
            uids = [],
        } = req.body || {};

        const normalizedSubject = String(subject || '').toLowerCase();
        if (!VALID_SUBJECTS.includes(normalizedSubject)) {
            return res.status(400).json({ success: false, error: `Invalid subject. Must be one of: ${VALID_SUBJECTS.join(', ')}` });
        }

        const normalizedChapterId = String(chapterId || '').trim();
        const normalizedTopic = String(topic || '').trim();
        const normalizedSubTopic = String(subTopic || '').trim();
        const normalizedMode = mode === 'test' ? 'test' : 'practice';
        const uidList = Array.isArray(uids) ? uids.map((u) => Number(u)).filter(Number.isFinite) : [];

        if (!normalizedChapterId || !normalizedTopic || !normalizedSubTopic) {
            return res.status(400).json({ success: false, error: 'chapterId, topic and subTopic are required' });
        }
        if (uidList.length === 0) {
            return res.status(400).json({ success: false, error: 'uids are required to start a run' });
        }

        await expireStaleRuns(req.user.id);

        let existing = await ImportedCurriculumQuizRun.findOne({
            userId: req.user.id,
            subject: normalizedSubject,
            chapterId: normalizedChapterId,
            topic: normalizedTopic,
            subTopic: normalizedSubTopic,
            mode: normalizedMode,
            status: 'in_progress',
        });

        const now = nowUtc();
        let resumed = false;

        if (existing) {
            if (normalizedMode === 'test' && Number(existing.attemptedQuestions || 0) > 0) {
                if (Number(existing.resumeCount || 0) >= Number(existing.maxResumes || 0)) {
                    existing.status = 'abandoned';
                    existing.abandonedAt = now;
                    existing.lastActivityAt = now;
                    await existing.save();
                    existing = null;
                } else {
                    existing.resumeCount = Number(existing.resumeCount || 0) + 1;
                    existing.lastActivityAt = now;
                    existing.expiresAt = addHours(now, RUN_EXPIRY_HOURS);
                    await existing.save();
                    resumed = true;
                }
            } else {
                existing.lastActivityAt = now;
                existing.expiresAt = addHours(now, RUN_EXPIRY_HOURS);
                await existing.save();
                resumed = Number(existing.attemptedQuestions || 0) > 0;
            }
        }

        const totalQuestions = uidList.length;
        let run = existing;
        if (!run) {
            run = await ImportedCurriculumQuizRun.create({
                userId: req.user.id,
                subject: normalizedSubject,
                chapterId: normalizedChapterId,
                topic: normalizedTopic,
                subTopic: normalizedSubTopic,
                mode: normalizedMode,
                uids: uidList,
                status: 'in_progress',
                currentIndex: 0,
                answers: sanitizeAnswers([], totalQuestions),
                questionTimes: sanitizeTimes([], totalQuestions),
                attemptedQuestions: 0,
                elapsedSeconds: 0,
                remainingSeconds: normalizedMode === 'test' ? totalQuestions * 90 : null,
                resumeCount: 0,
                maxResumes: normalizedMode === 'test' ? 1 : 999,
                totalQuestions,
                startedAt: now,
                lastActivityAt: now,
                expiresAt: addHours(now, RUN_EXPIRY_HOURS),
            });
        }

        const questions = await getImportedQuestionsByUIDs(run.uids || []);
        res.status(200).json({
            success: true,
            data: {
                resumed,
                run: serializeRun(run),
                questions,
            },
        });
    } catch (err) {
        console.error('startCurriculumRun error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

exports.getCurriculumRun = async (req, res) => {
    try {
        await expireStaleRuns(req.user.id);
        const run = await ImportedCurriculumQuizRun.findOne({
            _id: req.params.runId,
            userId: req.user.id,
        });
        if (!run) {
            return res.status(404).json({ success: false, error: 'Run not found' });
        }

        const questions = await getImportedQuestionsByUIDs(run.uids || []);
        res.status(200).json({
            success: true,
            data: {
                run: serializeRun(run),
                questions,
            },
        });
    } catch (err) {
        console.error('getCurriculumRun error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

exports.updateCurriculumRunProgress = async (req, res) => {
    try {
        await expireStaleRuns(req.user.id);
        const run = await ImportedCurriculumQuizRun.findOne({
            _id: req.params.runId,
            userId: req.user.id,
            status: 'in_progress',
        });
        if (!run) {
            return res.status(404).json({ success: false, error: 'Active run not found' });
        }

        const total = Number(run.totalQuestions || (run.uids || []).length || 0);
        if (total <= 0) {
            return res.status(400).json({ success: false, error: 'Run has no questions' });
        }

        if (req.body.answers !== undefined) {
            run.answers = sanitizeAnswers(req.body.answers, total);
            run.attemptedQuestions = countAttempted(run.answers);
        }
        if (req.body.questionTimes !== undefined) {
            run.questionTimes = sanitizeTimes(req.body.questionTimes, total);
        }
        if (req.body.currentIndex !== undefined) {
            const idx = Number(req.body.currentIndex);
            run.currentIndex = Number.isFinite(idx) ? Math.max(0, Math.min(total - 1, Math.floor(idx))) : run.currentIndex;
        }
        if (req.body.elapsedSeconds !== undefined) {
            const elapsed = Number(req.body.elapsedSeconds);
            run.elapsedSeconds = Number.isFinite(elapsed) && elapsed > 0 ? Math.floor(elapsed) : 0;
        }
        if (run.mode === 'test' && req.body.remainingSeconds !== undefined) {
            const remaining = Number(req.body.remainingSeconds);
            run.remainingSeconds = Number.isFinite(remaining) ? Math.max(0, Math.floor(remaining)) : run.remainingSeconds;
        }

        run.lastActivityAt = nowUtc();
        run.expiresAt = addHours(run.lastActivityAt, RUN_EXPIRY_HOURS);
        await run.save();

        res.status(200).json({ success: true, data: { run: serializeRun(run) } });
    } catch (err) {
        console.error('updateCurriculumRunProgress error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

exports.abandonCurriculumRun = async (req, res) => {
    try {
        await expireStaleRuns(req.user.id);
        const run = await ImportedCurriculumQuizRun.findOne({
            _id: req.params.runId,
            userId: req.user.id,
            status: 'in_progress',
        });
        if (!run) {
            return res.status(404).json({ success: false, error: 'Active run not found' });
        }

        run.status = 'abandoned';
        run.abandonedAt = nowUtc();
        run.lastActivityAt = nowUtc();
        await run.save();

        res.status(200).json({ success: true, data: { run: serializeRun(run) } });
    } catch (err) {
        console.error('abandonCurriculumRun error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

exports.submitCurriculumRun = async (req, res) => {
    try {
        await expireStaleRuns(req.user.id);
        const run = await ImportedCurriculumQuizRun.findOne({
            _id: req.params.runId,
            userId: req.user.id,
            status: 'in_progress',
        });
        if (!run) {
            return res.status(404).json({ success: false, error: 'Active run not found' });
        }

        const total = Number(run.totalQuestions || (run.uids || []).length || 0);
        if (total <= 0) {
            return res.status(400).json({ success: false, error: 'Run has no questions' });
        }

        if (req.body.answers !== undefined) {
            run.answers = sanitizeAnswers(req.body.answers, total);
        }
        if (req.body.questionTimes !== undefined) {
            run.questionTimes = sanitizeTimes(req.body.questionTimes, total);
        }
        run.attemptedQuestions = countAttempted(run.answers);

        if (req.body.elapsedSeconds !== undefined) {
            const elapsed = Number(req.body.elapsedSeconds);
            run.elapsedSeconds = Number.isFinite(elapsed) && elapsed > 0 ? Math.floor(elapsed) : run.elapsedSeconds;
        }
        if (run.mode === 'test' && req.body.remainingSeconds !== undefined) {
            const remaining = Number(req.body.remainingSeconds);
            run.remainingSeconds = Number.isFinite(remaining) ? Math.max(0, Math.floor(remaining)) : run.remainingSeconds;
        }

        const questions = await getImportedQuestionsByUIDs(run.uids || []);
        const score = evaluateRunScore(questions, run.answers || []);

        run.correctAnswers = score.correctAnswers;
        run.totalQuestions = score.totalQuestions;
        run.percentage = score.percentage;
        run.status = 'submitted';
        run.submittedAt = nowUtc();
        run.lastActivityAt = nowUtc();
        await run.save();

        await ImportedSubtopicAttempt.create({
            userId: req.user.id,
            subject: run.subject,
            chapterId: run.chapterId,
            topic: run.topic,
            subTopic: run.subTopic,
            mode: run.mode,
            totalQuestions: score.totalQuestions,
            correctAnswers: score.correctAnswers,
            percentage: score.percentage,
            timeTaken: Number(run.elapsedSeconds || 0),
            uids: run.uids || [],
            attemptedAt: run.submittedAt,
        });

        try {
            await enrollQuestionsInNeuronZ(req.user.id, run.uids || [], run.answers || [], {
                subject: run.subject,
                chapterId: run.chapterId,
                topic: run.topic,
                subTopic: run.subTopic,
            });
        } catch (enrollErr) {
            console.warn('[submitCurriculumRun] NeuronZ enroll failed (non-blocking):', enrollErr.message);
        }

        res.status(200).json({
            success: true,
            data: {
                run: serializeRun(run),
                summary: {
                    score: score.correctAnswers,
                    total: score.totalQuestions,
                    percentage: score.percentage,
                    subject: run.subject,
                    topic: run.subTopic,
                    chapterLabel: run.chapterId,
                    attemptedAt: run.submittedAt,
                },
            },
        });
    } catch (err) {
        console.error('submitCurriculumRun error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

exports.trackSubTopicAttempt = async (req, res) => {
    try {
        const {
            subject,
            chapterId,
            topic,
            subTopic,
            mode = 'practice',
            totalQuestions,
            correctAnswers,
            timeTaken = 0,
            uids = [],
        } = req.body || {};

        const normalizedSubject = String(subject || '').toLowerCase();
        if (!VALID_SUBJECTS.includes(normalizedSubject)) {
            return res.status(400).json({
                success: false,
                error: `Invalid subject. Must be one of: ${VALID_SUBJECTS.join(', ')}`,
            });
        }

        const normalizedChapterId = String(chapterId || '').trim();
        const normalizedTopic = String(topic || '').trim();
        const normalizedSubTopic = String(subTopic || '').trim();
        if (!normalizedChapterId || !normalizedTopic || !normalizedSubTopic) {
            return res.status(400).json({
                success: false,
                error: 'chapterId, topic and subTopic are required',
            });
        }

        const total = Number(totalQuestions);
        const correct = Number(correctAnswers);
        if (!Number.isFinite(total) || total < 1) {
            return res.status(400).json({ success: false, error: 'totalQuestions must be >= 1' });
        }

        if (!Number.isFinite(correct) || correct < 0 || correct > total) {
            return res.status(400).json({ success: false, error: 'correctAnswers must be between 0 and totalQuestions' });
        }

        const percentage = Math.round((correct / total) * 100);

        const attempt = await ImportedSubtopicAttempt.create({
            userId: req.user.id,
            subject: normalizedSubject,
            chapterId: normalizedChapterId,
            topic: normalizedTopic,
            subTopic: normalizedSubTopic,
            mode: mode === 'test' ? 'test' : 'practice',
            totalQuestions: total,
            correctAnswers: correct,
            percentage,
            timeTaken: Math.max(0, Number(timeTaken) || 0),
            uids: Array.isArray(uids) ? uids.map(Number).filter(Number.isFinite) : [],
            attemptedAt: new Date(),
        });

        res.status(201).json({
            success: true,
            data: {
                id: attempt._id,
                subject: attempt.subject,
                chapterId: attempt.chapterId,
                topic: attempt.topic,
                subTopic: attempt.subTopic,
                mode: attempt.mode,
                totalQuestions: attempt.totalQuestions,
                correctAnswers: attempt.correctAnswers,
                percentage: attempt.percentage,
                attemptedAt: attempt.attemptedAt,
                completed: attempt.percentage >= 60,
            },
        });
    } catch (err) {
        console.error('trackSubTopicAttempt error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

exports.getQuestionsByUIDs = async (req, res) => {
    try {
        const { uids, page = 1, limit = 20 } = req.query;

        if (!uids) {
            return res.status(400).json({ success: false, error: 'uids query param is required' });
        }

        const uidList = String(uids)
            .split(',')
            .map((u) => u.trim())
            .filter(Boolean);

        if (uidList.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid uids provided' });
        }

        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
        const skip = (pageNum - 1) * limitNum;
        const paginatedUIDs = uidList.slice(skip, skip + limitNum);

        const questions = await ImportedQuestion.find({
            questionId: { $in: paginatedUIDs.map(String) },
        }).lean();

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

// @desc  Log a Toppers Corner resource view
// @route POST /api/v1/curriculum/log-resource
// @access Private
exports.logResource = async (req, res) => {
    try {
        const { chapterId, subject, resourceType, durationSeconds } = req.body;

        if (!chapterId || !resourceType) {
            return res.status(400).json({ success: false, error: 'chapterId and resourceType are required' });
        }

        const validTypes = ['video', 'audio', 'slides', 'mindmap', 'report', 'infographic', 'flashcards'];
        if (!validTypes.includes(resourceType)) {
            return res.status(400).json({ success: false, error: 'Invalid resourceType' });
        }

        await ToppersResourceLog.create({
            userId: req.user._id,
            chapterId,
            subject: subject || undefined,
            resourceType,
            durationSeconds: Math.max(0, Number(durationSeconds) || 0),
            viewedAt: new Date(),
        });

        res.status(201).json({ success: true });
    } catch (err) {
        console.error('logResource error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// @desc  Toggle like/dislike for a Toppers Corner resource
// @route POST /api/v1/curriculum/toggle-reaction
// @access Private
exports.toggleResourceReaction = async (req, res) => {
    try {
        const { chapterId, resourceType, reaction } = req.body;

        if (!chapterId || !resourceType || !reaction) {
            return res.status(400).json({ success: false, error: 'chapterId, resourceType, and reaction are required' });
        }

        const validTypes = ['video', 'audio', 'slides', 'infographic', 'report', 'mindmap', 'flashcards'];
        if (!validTypes.includes(resourceType)) {
            return res.status(400).json({ success: false, error: 'Invalid resourceType' });
        }

        const validReactions = ['like', 'dislike', 'none'];
        if (!validReactions.includes(reaction)) {
            return res.status(400).json({ success: false, error: 'Invalid reaction' });
        }

        await ToppersResourceReaction.findOneAndUpdate(
            { userId: req.user._id, chapterId, resourceType },
            { reaction },
            { upsert: true, new: true }
        );

        res.status(200).json({ success: true });
    } catch (err) {
        console.error('toggleResourceReaction error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// @desc  Get aggregated reactions and current user's reactions for a chapter
// @route GET /api/v1/curriculum/reactions/:chapterId
// @access Private
exports.getResourceReactions = async (req, res) => {
    try {
        const { chapterId } = req.params;

        // Aggregate total likes and dislikes for the chapter
        const aggregated = await ToppersResourceReaction.aggregate([
            { $match: { chapterId } },
            {
                $group: {
                    _id: '$resourceType',
                    likes: { $sum: { $cond: [{ $eq: ['$reaction', 'like'] }, 1, 0] } },
                    dislikes: { $sum: { $cond: [{ $eq: ['$reaction', 'dislike'] }, 1, 0] } }
                }
            }
        ]);

        // Get the current user's reactions
        const userReactionsDoc = await ToppersResourceReaction.find({
            userId: req.user._id,
            chapterId
        }).lean();

        // Format response
        const reactions = {};
        
        aggregated.forEach(agg => {
            reactions[agg._id] = {
                likes: agg.likes,
                dislikes: agg.dislikes,
                userReaction: 'none'
            };
        });

        userReactionsDoc.forEach(ur => {
            if (!reactions[ur.resourceType]) {
                reactions[ur.resourceType] = { likes: 0, dislikes: 0, userReaction: 'none' };
            }
            reactions[ur.resourceType].userReaction = ur.reaction;
        });

        res.json({ success: true, data: reactions });

    } catch (err) {
        console.error('getResourceReactions error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};
