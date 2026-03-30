const SUPPORTED_TYPES = ['mcq', 'fillup', 'match', 'order', 'flashcard', 'video'];
const GRADED_TYPES = ['mcq', 'fillup', 'match', 'order'];

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

const pickLocalizedValue = (value, language = 'en') => {
    if (value == null) return null;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value;
    if (typeof value === 'object') {
        if (language === 'hi' && hasText(value.hi)) return value.hi;
        if (hasText(value.en)) return value.en;
        if (hasText(value.hi)) return value.hi;
    }
    return value;
};

const normalizeQuestionType = (type) => {
    const raw = String(type || '').trim().toLowerCase();
    if (!raw) return 'mcq';

    const legacyMap = {
        'fill-blank': 'fillup',
        'fillblank': 'fillup',
        'diagram-label': 'match',
        numeric: 'fillup',
    };

    const normalized = legacyMap[raw] || raw;
    return SUPPORTED_TYPES.includes(normalized) ? normalized : 'mcq';
};

const dedupeStrings = (values = []) => (
    Array.from(
        new Set(
            values
                .filter((value) => hasText(value))
                .map((value) => String(value).trim())
        )
    )
);

const buildUnsupported = (type, reason) => ({
    typeData: {},
    isSupported: false,
    unsupportedReason: reason || `${type} data is not available yet`,
});

const splitMatchPair = (value) => {
    const text = pickLocalizedValue(value);
    if (!hasText(text)) return null;

    const normalized = String(text).replace(/\r?\n/g, '\n').trim();
    const separators = [',', '|', ':', ' - ', '\t'];

    for (const separator of separators) {
        const index = normalized.indexOf(separator);
        if (index === -1) continue;

        const left = normalized.slice(0, index).trim();
        const right = normalized.slice(index + separator.length).trim();
        if (hasText(left) && hasText(right)) {
            return { left, right };
        }
    }

    const lines = normalized.split('\n').map((part) => part.trim()).filter(Boolean);
    if (lines.length >= 2) {
        return {
            left: lines[0],
            right: lines.slice(1).join(' '),
        };
    }

    return null;
};

const buildLegacyMatchPairs = (question = {}) => {
    const optionKeys = ['A', 'B', 'C', 'D'];
    return optionKeys
        .map((key, index) => {
            const parsed = splitMatchPair(question?.options?.[key]);
            if (!parsed) return null;
            return {
                id: key || String(index),
                left: parsed.left,
                right: parsed.right,
            };
        })
        .filter(Boolean);
};

const normalizeMatchPair = (pair = {}, index = 0, language = 'en') => ({
    id: pair?.id || String.fromCharCode(65 + index),
    left: pickLocalizedValue(pair?.left, language) || '',
    right: pickLocalizedValue(pair?.right, language) || '',
});


const buildTypeDataFromImported = (question = {}) => {
    const type = normalizeQuestionType(question.type);
    const optionMap = ['A', 'B', 'C', 'D'].reduce((acc, key) => {
        const value = question?.options?.[key];
        if (hasText(value)) acc[key] = String(value).trim();
        return acc;
    }, {});

    if (type === 'mcq') {
        const options = ['A', 'B', 'C', 'D']
            .map((key) => optionMap[key])
            .filter((value) => hasText(value));
        return {
            typeData: {
                options,
                optionMap,
                correctOption: question?.correct_option || null,
            },
            isSupported: options.length > 0,
            unsupportedReason: options.length > 0 ? null : 'MCQ options are missing',
        };
    }

    if (type === 'fillup') {
        const acceptedAnswers = dedupeStrings([
            question?.correct_answer,
            ...(Array.isArray(question?.acceptedAnswers) ? question.acceptedAnswers : []),
        ]);
        return {
            typeData: {
                primaryAnswer: acceptedAnswers[0] || null,
                acceptedAnswers,
            },
            isSupported: acceptedAnswers.length > 0,
            unsupportedReason: acceptedAnswers.length > 0 ? null : 'Fillup answer is missing',
        };
    }

    if (type === 'flashcard') {
        const front = hasText(question?.question) ? String(question.question).trim() : null;
        const back = hasText(question?.explanation) ? String(question.explanation).trim() : null;
        return {
            typeData: { front, back },
            isSupported: Boolean(front && back),
            unsupportedReason: front && back ? null : 'Flashcard front/back content is incomplete',
        };
    }

    if (type === 'video') {
        const videoUrl = hasText(question?.videoUrl) ? String(question.videoUrl).trim() : null;
        const prompt = hasText(question?.question) ? String(question.question).trim() : null;
        return {
            typeData: { videoUrl, prompt },
            isSupported: Boolean(prompt || videoUrl),
            unsupportedReason: prompt || videoUrl ? null : 'Video content is missing',
        };
    }

    if (type === 'match') {
        const storedPairs = Array.isArray(question?.typeData?.pairs)
            ? question.typeData.pairs.map((pair, index) => normalizeMatchPair(pair, index))
            : [];
        const fallbackPairs = storedPairs.length > 0 ? storedPairs : buildLegacyMatchPairs(question);

        if (fallbackPairs.length > 0) {
            return {
                typeData: { pairs: fallbackPairs },
                isSupported: true,
                unsupportedReason: null,
            };
        }
        return buildUnsupported(type, 'Match pairs are not stored for this question yet');
    }

    if (type === 'order') {
        const items = Array.isArray(question?.typeData?.items) ? question.typeData.items : [];
        const correctOrder = Array.isArray(question?.typeData?.correctOrder) ? question.typeData.correctOrder : [];
        if (items.length > 0 && correctOrder.length > 0) {
            return {
                typeData: { items, correctOrder },
                isSupported: true,
                unsupportedReason: null,
            };
        }
        return buildUnsupported(type, 'Order items are not stored for this question yet');
    }

    return buildUnsupported(type, `Unsupported question type: ${type}`);
};

const buildTypeDataFromQuestionDoc = (question = {}, language = 'en') => {
    const type = normalizeQuestionType(question.questionType || question.type);
    const typeData = question.typeData || {};

    if (type === 'mcq') {
        const optionMap = {};
        const options = Array.isArray(question.options)
            ? question.options.map((option, index) => {
                const key = option?.key || String.fromCharCode(65 + index);
                const text = pickLocalizedValue(option?.text, language) || '';
                optionMap[key] = text;
                return text;
            })
            : Array.isArray(typeData.options)
                ? typeData.options
                : [];

        return {
            typeData: {
                options,
                optionMap: Object.keys(optionMap).length ? optionMap : (typeData.optionMap || {}),
                correctOption: typeData.correctOption || question.correctAnswer || null,
            },
            isSupported: options.length > 0,
            unsupportedReason: options.length > 0 ? null : 'MCQ options are missing',
        };
    }

    if (type === 'fillup') {
        const acceptedAnswers = dedupeStrings(typeData.acceptedAnswers || [typeData.primaryAnswer]);
        return {
            typeData: {
                primaryAnswer: typeData.primaryAnswer || acceptedAnswers[0] || null,
                acceptedAnswers,
            },
            isSupported: acceptedAnswers.length > 0,
            unsupportedReason: acceptedAnswers.length > 0 ? null : 'Fillup answer is missing',
        };
    }

    if (type === 'match') {
        const storedPairs = Array.isArray(typeData.pairs)
            ? typeData.pairs.map((pair, index) => normalizeMatchPair(pair, index, language))
            : [];
        const legacyPairs = storedPairs.length > 0 ? storedPairs : buildLegacyMatchPairs(question);
        const pairs = legacyPairs.filter((pair) => hasText(pair.left) && hasText(pair.right));
        return {
            typeData: { pairs },
            isSupported: pairs.length > 0,
            unsupportedReason: pairs.length > 0 ? null : 'Match pairs are not available',
        };
    }

    if (type === 'order') {
        const items = Array.isArray(typeData.items)
            ? typeData.items.map((item, index) => ({
                id: item?.id || String(index),
                text: pickLocalizedValue(item?.text ?? item, language) || '',
            }))
            : [];
        const correctOrder = Array.isArray(typeData.correctOrder) ? typeData.correctOrder : [];
        return {
            typeData: { items, correctOrder },
            isSupported: items.length > 0 && correctOrder.length > 0,
            unsupportedReason: items.length > 0 && correctOrder.length > 0 ? null : 'Order items are not available',
        };
    }

    if (type === 'flashcard') {
        const front = pickLocalizedValue(typeData.front, language) || pickLocalizedValue(question.question, language) || null;
        const back = pickLocalizedValue(typeData.back, language) || pickLocalizedValue(question.explanation, language) || null;
        return {
            typeData: { front, back },
            isSupported: Boolean(front && back),
            unsupportedReason: front && back ? null : 'Flashcard front/back content is incomplete',
        };
    }

    if (type === 'video') {
        const videoUrl = hasText(typeData.videoUrl) ? String(typeData.videoUrl).trim() : (question?.videoExplanation?.url || null);
        const prompt = pickLocalizedValue(typeData.prompt, language) || pickLocalizedValue(question.question, language) || null;
        return {
            typeData: { videoUrl, prompt },
            isSupported: Boolean(prompt || videoUrl),
            unsupportedReason: prompt || videoUrl ? null : 'Video content is missing',
        };
    }

    return buildUnsupported(type, `Unsupported question type: ${type}`);
};

const serializeImportedQuestionForClient = (question = {}) => {
    const type = normalizeQuestionType(question.type);
    const { typeData, isSupported, unsupportedReason } = buildTypeDataFromImported(question);
    return {
        ...question,
        type,
        questionType: type,
        correctAnswer: question?.correct_option || question?.correct_answer || null,
        imageId: question?.imageId || null,
        imageUrl: question?.imageUrl || null,
        explanationImageUrl: question?.explanationImageUrl || null,
        videoUrl: question?.videoUrl || typeData.videoUrl || null,
        typeData,
        isSupported,
        unsupportedReason,
    };
};

const serializeQuestionDocForClient = (question = {}, language = 'en') => {
    const rawQuestion = typeof question.toObject === 'function' ? question.toObject() : question;
    const type = normalizeQuestionType(rawQuestion.questionType || rawQuestion.type);
    const localizedQuestion = pickLocalizedValue(rawQuestion.question, language) || '';
    const localizedExplanation = pickLocalizedValue(rawQuestion.explanation, language) || '';
    const { typeData, isSupported, unsupportedReason } = buildTypeDataFromQuestionDoc(rawQuestion, language);

    return {
        ...rawQuestion,
        type,
        questionType: type,
        question: localizedQuestion,
        explanation: localizedExplanation,
        imageId: rawQuestion?.imageId || null,
        imageUrl: rawQuestion?.imageUrl || null,
        explanationImageUrl: rawQuestion?.typeData?.explanationImageUrl || rawQuestion?.explanationImageUrl || null,
        videoUrl: rawQuestion?.videoExplanation?.url || rawQuestion?.typeData?.videoUrl || null,
        typeData,
        correctAnswer: rawQuestion?.correctAnswer || typeData.correctOption || null,
        isSupported,
        unsupportedReason,
    };
};

const answerPayloadHasValue = (payload = {}) => {
    if (!payload || typeof payload !== 'object') return false;
    switch (payload.kind) {
        case 'mcq':
            return Number.isInteger(payload.selectedOption);
        case 'fillup':
            return hasText(payload.value);
        case 'match':
            return payload.pairs && Object.keys(payload.pairs).length > 0;
        case 'order':
            return Array.isArray(payload.orderedIds) && payload.orderedIds.length > 0;
        case 'flashcard':
            return Boolean(payload.completed || payload.flipped);
        case 'video':
            return Boolean(payload.completed);
        default:
            return false;
    }
};

const normalizeTextAnswer = (value) => String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');

const levenshteinDistance = (a = '', b = '') => {
    const source = String(a);
    const target = String(b);
    const rows = source.length + 1;
    const cols = target.length + 1;
    const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
    for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

    for (let i = 1; i < rows; i += 1) {
        for (let j = 1; j < cols; j += 1) {
            const cost = source[i - 1] === target[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    return matrix[rows - 1][cols - 1];
};

const calculateSimilarity = (a = '', b = '') => {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    if (a === b) return 1;
    const maxLen = Math.max(a.length, b.length);
    return 1 - (levenshteinDistance(a, b) / maxLen);
};

const isQuestionTypeGraded = (type) => GRADED_TYPES.includes(normalizeQuestionType(type));

const evaluateQuestionAttempt = (question = {}, answer = {}, testConfig = {}) => {
    const type = normalizeQuestionType(question.questionType || question.type);
    const typeData = question.typeData || {};
    const attempted = Boolean(answer?.selectedOption) || answerPayloadHasValue(answer?.answerPayload);
    if (!attempted) {
        return {
            attempted: false,
            isCorrect: false,
            marksAwarded: 0,
            evaluationStatus: 'ungraded',
            evaluationReason: 'Question not attempted',
        };
    }

    const marksPerQuestion = Number(testConfig?.marksPerQuestion || 4);
    const negativeMarks = testConfig?.negativeMarking ? Number(testConfig?.negativeMarks || 0) : 0;
    const payload = answer?.answerPayload || {};

    if (type === 'mcq') {
        const selectedOption = String(answer?.selectedOption || '').trim().toUpperCase();
        const correctOption = String(typeData.correctOption || question.correctAnswer || '').trim().toUpperCase();
        const isCorrect = Boolean(selectedOption && correctOption && selectedOption === correctOption);
        return {
            attempted: true,
            isCorrect,
            marksAwarded: isCorrect ? marksPerQuestion : negativeMarks,
            evaluationStatus: isCorrect ? 'correct' : 'incorrect',
            evaluationReason: isCorrect ? 'Correct option selected' : `Correct option is ${correctOption || 'N/A'}`,
        };
    }

    if (type === 'fillup') {
        const acceptedAnswers = Array.isArray(typeData.acceptedAnswers) ? typeData.acceptedAnswers : [];
        const normalizedUser = normalizeTextAnswer(payload.value);
        const normalizedCandidates = acceptedAnswers.map((candidate) => normalizeTextAnswer(candidate)).filter(Boolean);
        const exactMatch = normalizedCandidates.some((candidate) => candidate === normalizedUser);
        const similarity = exactMatch
            ? 1
            : normalizedCandidates.reduce((best, candidate) => Math.max(best, calculateSimilarity(candidate, normalizedUser)), 0);
        const isCorrect = exactMatch || similarity >= 0.8;
        return {
            attempted: true,
            isCorrect,
            marksAwarded: isCorrect ? marksPerQuestion : negativeMarks,
            evaluationStatus: isCorrect ? 'correct' : 'incorrect',
            evaluationReason: isCorrect
                ? (exactMatch ? 'Accepted fillup answer matched' : `Accepted via fuzzy match (${Math.round(similarity * 100)}% similarity)`)
                : `Accepted answers: ${acceptedAnswers.join(', ')}`,
        };
    }

    if (type === 'match') {
        const pairs = Array.isArray(typeData.pairs) ? typeData.pairs : [];
        const userPairs = payload.pairs || {};
        const total = pairs.length;
        const correct = pairs.reduce((count, pair, index) => {
            const leftKey = pair?.id || pair?.left || String(index);
            return userPairs[leftKey] === pair?.right ? count + 1 : count;
        }, 0);
        const isCorrect = total > 0 && correct === total;
        return {
            attempted: true,
            isCorrect,
            marksAwarded: isCorrect ? marksPerQuestion : 0,
            evaluationStatus: isCorrect ? 'correct' : (correct > 0 ? 'partial' : 'incorrect'),
            evaluationReason: `${correct}/${total} matches correct`,
        };
    }

    if (type === 'order') {
        const correctOrder = Array.isArray(typeData.correctOrder) ? typeData.correctOrder.map(String) : [];
        const orderedIds = Array.isArray(payload.orderedIds) ? payload.orderedIds.map(String) : [];
        const matchedCount = orderedIds.reduce((count, value, index) => (
            value === correctOrder[index] ? count + 1 : count
        ), 0);
        const isCorrect = correctOrder.length > 0 && orderedIds.length === correctOrder.length && matchedCount === correctOrder.length;
        return {
            attempted: true,
            isCorrect,
            marksAwarded: isCorrect ? marksPerQuestion : 0,
            evaluationStatus: isCorrect ? 'correct' : (matchedCount > 0 ? 'partial' : 'incorrect'),
            evaluationReason: `${matchedCount}/${correctOrder.length} positions correct`,
        };
    }

    if (type === 'flashcard' || type === 'video') {
        return {
            attempted: true,
            isCorrect: false,
            marksAwarded: 0,
            evaluationStatus: 'ungraded',
            evaluationReason: `${type} questions are completion-based and not auto-graded`,
        };
    }

    return {
        attempted: true,
        isCorrect: false,
        marksAwarded: 0,
        evaluationStatus: 'ungraded',
        evaluationReason: `Unsupported question type: ${type}`,
    };
};

module.exports = {
    normalizeQuestionType,
    isQuestionTypeGraded,
    buildTypeDataFromImported,
    serializeImportedQuestionForClient,
    serializeQuestionDocForClient,
    answerPayloadHasValue,
    evaluateQuestionAttempt,
};
