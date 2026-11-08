const SUPPORTED_TYPES = ['mcq', 'fillup', 'match', 'order', 'flashcard', 'video'];
const GRADED_TYPES = ['mcq', 'fillup', 'match', 'order'];

const FORMULA_REGEX = /\$\$[\s\S]*?\$\$|\$[^\$\n]+\$|\\\(|\\\[|\\frac|\\sqrt|\\times|\\pm|\\rightarrow|\\Delta|\\theta|\\omega|\\lambda|\\alpha|\\beta|\\mu|\\Omega|[\u03B1-\u03C9\u0391-\u03A9\u221A\u00B2\u00B3\u00B1\u00D7\u00F7\u00B0\u03C0\u03B8]|π|√|²|³|±|×|÷|°/i;
const STMT_REGEX = /(?:Given below are two statements[:\s]*)?Statement\s*(?:I|1)\s*[:.)-]\s*([\s\S]*?)\s*Statement\s*(?:II|2)\s*[:.)-]\s*([\s\S]*?)(?:In the light of the above statements|Choose the correct answer|Select the correct option|$)/i;
const MATCH_HEADER_REGEX = /Column\s*(?:I|1).*Column\s*(?:II|2)|List\s*[-–]?\s*(?:I|1).*List\s*[-–]?\s*(?:II|2)|Match\s+(?:the\s+)?following/i;
const MATRIX_PAIR_REGEX = /\(([a-d])\)\s*([\s\S]+?)\s*[-–]\s*\(([ivx\d]+)\)\s*([^\n\r]+)/gi;
const MATRIX_OPTION_CODE_REGEX = /[a-d]\s*-\s*\([i|v|x\d]+\)/i;

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

const detectFormula = (questionText, options = {}, explanation = '') => {
    if (FORMULA_REGEX.test(String(questionText || ''))) return true;
    if (FORMULA_REGEX.test(String(explanation || ''))) return true;
    const optionValues = Array.isArray(options) ? options : Object.values(options || {});
    for (const val of optionValues) {
        const text = typeof val === 'object' && val !== null ? (val.text || val.value || '') : String(val || '');
        if (FORMULA_REGEX.test(String(text || ''))) return true;
    }
    return false;
};

const parseAssertionReason = (questionText) => {
    if (!questionText || typeof questionText !== 'string') return null;
    const cleaned = questionText.replace(/^(?:Consider the following\s+)?Assertion\s*(?:\(A\))?\s*(?:and|&)\s*Reason\s*(?:\(R\))?[:\s]*/i, '').trim();
    const regex = /(?:Assertion\s*(?:\(A\)|[-:])|\bA\s*[:.-])\s*([\s\S]*?)\s*(?:Reason\s*(?:\(R\)|[-:])|\bR\s*[:.-])\s*([\s\S]*?)(?:Choose the correct statement|Select the correct option|Choose the correct answer|$)/i;
    const match = cleaned.match(regex);
    if (!match) return null;

    const assertion = match[1].replace(/^\s*[:.-]\s*/, '').trim();
    const reason = match[2].replace(/^\s*[:.-]\s*/, '').trim();

    if (!assertion || !reason) return null;

    return {
        assertion,
        reason,
        standardOptions: true,
    };
};

const parseStatementQuestion = (questionText) => {
    if (!questionText || typeof questionText !== 'string') return null;
    const match = questionText.match(STMT_REGEX);
    if (!match) return null;

    const statement1 = match[1].replace(/^\s*[:.-]\s*/, '').trim();
    const statement2 = match[2].replace(/^\s*[:.-]\s*/, '').trim();

    if (!statement1 || !statement2) return null;

    return {
        statement1,
        statement2,
    };
};

const parseMatrixMatch = (questionText, options = {}) => {
    if (!questionText || typeof questionText !== 'string') return null;

    const isMatchHeader = MATCH_HEADER_REGEX.test(questionText);
    if (!isMatchHeader) return null;

    const pairs = [];
    let match;
    const regex = new RegExp(MATRIX_PAIR_REGEX);
    while ((match = regex.exec(questionText)) !== null) {
        pairs.push({
            id: match[1].toUpperCase(),
            leftLabel: `(${match[1]})`,
            leftText: match[2].trim(),
            rightLabel: `(${match[3]})`,
            rightText: match[4].trim(),
        });
    }

    const optionCodes = {};
    let isMatrixOptions = false;
    ['A', 'B', 'C', 'D'].forEach((key) => {
        const val = options[key] || options[key.toLowerCase()];
        if (typeof val === 'string') {
            optionCodes[key] = val.trim();
            if (MATRIX_OPTION_CODE_REGEX.test(val)) {
                isMatrixOptions = true;
            }
        }
    });

    if (pairs.length >= 2 || isMatrixOptions) {
        return {
            pairs,
            matrixOptions: optionCodes,
            isMatrixMCQ: isMatrixOptions,
        };
    }

    return null;
};

const parseFillupSyllables = (options = {}, correctAnswer = '') => {
    const primaryRaw = options?.A || options?.a || options?.primary;
    if (!primaryRaw || typeof primaryRaw !== 'string') {
        return { syllableTokens: [], distractorTokens: [] };
    }

    const rawTokens = primaryRaw
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

    const cleanAnswer = String(correctAnswer || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

    const syllableTokens = [];
    const distractorTokens = [];

    rawTokens.forEach((token) => {
        const cleanToken = token.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanAnswer.includes(cleanToken) && cleanToken.length > 0) {
            syllableTokens.push(token);
        } else {
            distractorTokens.push(token);
        }
    });

    return {
        syllableTokens: syllableTokens.length ? syllableTokens : rawTokens,
        distractorTokens,
    };
};

const parseOrderQuestion = (options = {}, correctAnswer = '') => {
    const items = [];
    const labels = ['A', 'B', 'C', 'D'];

    labels.forEach((label) => {
        const raw = options[label] || options[label.toLowerCase()];
        if (!raw || typeof raw !== 'string') return;

        const commaIdx = raw.indexOf(',');
        if (commaIdx !== -1) {
            const stepNum = parseInt(raw.slice(0, commaIdx).trim(), 10);
            const text = raw.slice(commaIdx + 1).trim();
            items.push({
                id: label,
                stepNumber: isNaN(stepNum) ? items.length + 1 : stepNum,
                text,
            });
        } else {
            items.push({
                id: label,
                stepNumber: items.length + 1,
                text: raw.trim(),
            });
        }
    });

    if (items.length < 2) return null;

    const splitChar = String(correctAnswer || '').includes('>')
        ? '>'
        : String(correctAnswer || '').includes('→')
            ? '→'
            : ',';
    const correctSequence = String(correctAnswer || '')
        .split(splitChar)
        .map((s) => s.trim())
        .filter(Boolean);

    const correctOrder = items
        .slice()
        .sort((a, b) => a.stepNumber - b.stepNumber)
        .map((item) => item.id);

    return {
        items,
        correctSequence,
        correctOrder,
    };
};

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

const serializeQuestionForClient = (question = {}, language = 'en') => {
    if (!question) return null;
    const rawQuestion = typeof question.toObject === 'function' ? question.toObject() : { ...question };
    const type = normalizeQuestionType(rawQuestion.questionType || rawQuestion.type);
    const questionText = pickLocalizedValue(rawQuestion.question, language) || '';
    const explanation = pickLocalizedValue(rawQuestion.explanation, language) || '';

    const isImportedFormat = rawQuestion.options && !Array.isArray(rawQuestion.options) && typeof rawQuestion.options === 'object';
    const baseResult = isImportedFormat
        ? buildTypeDataFromImported(rawQuestion)
        : buildTypeDataFromQuestionDoc(rawQuestion, language);

    const typeData = { ...baseResult.typeData };
    let isSupported = baseResult.isSupported;
    let unsupportedReason = baseResult.unsupportedReason;

    const optionsSource = rawQuestion.options || typeData.optionMap || {};
    const isFormula = detectFormula(questionText, optionsSource, explanation);
    const correctAnswer = rawQuestion.correctAnswer || rawQuestion.correct_answer || rawQuestion.correct_option || typeData.correctOption || null;

    if (type === 'mcq') {
        const ar = parseAssertionReason(questionText);
        if (ar) {
            typeData.kind = 'assertion_reason';
            typeData.assertionReason = ar;
        } else {
            const stmt = parseStatementQuestion(questionText);
            if (stmt) {
                typeData.kind = 'statement';
                typeData.statementData = stmt;
            } else {
                const mm = parseMatrixMatch(questionText, optionsSource);
                if (mm) {
                    typeData.kind = 'match';
                    typeData.matrixData = mm;
                }
            }
        }
    } else if (type === 'fillup') {
        const syllables = parseFillupSyllables(optionsSource, correctAnswer);
        if (syllables.syllableTokens.length > 0) {
            const combinedTokens = [...syllables.syllableTokens, ...syllables.distractorTokens];
            const tokenRack = combinedTokens.slice().sort(() => Math.random() - 0.5);
            typeData.syllables = {
                primaryAnswer: typeData.primaryAnswer || correctAnswer,
                acceptedAnswers: typeData.acceptedAnswers || [correctAnswer].filter(Boolean),
                syllableTokens: syllables.syllableTokens,
                distractorTokens: syllables.distractorTokens,
                tokenRack,
            };
        }
    } else if (type === 'order') {
        if (!typeData.items || typeData.items.length === 0) {
            const order = parseOrderQuestion(optionsSource, correctAnswer);
            if (order) {
                typeData.items = order.items;
                typeData.correctOrder = order.correctOrder;
                typeData.correctSequence = order.correctSequence;
                isSupported = true;
                unsupportedReason = null;
            }
        }
    }

    const imageUrl = rawQuestion.imageUrl || rawQuestion.questionImageUrl || null;
    const explanationImageUrl = rawQuestion.explanationImageUrl || rawQuestion.typeData?.explanationImageUrl || null;

    return {
        ...rawQuestion,
        type,
        questionType: type,
        question: questionText,
        explanation,
        imageId: rawQuestion.imageId || null,
        imageUrl,
        explanationImageUrl,
        videoUrl: rawQuestion.videoExplanation?.url || rawQuestion.videoUrl || typeData.videoUrl || null,
        typeData,
        correctAnswer,
        isFormula,
        isSupported,
        unsupportedReason,
    };
};

const serializeImportedQuestionForClient = (question = {}) => {
    return serializeQuestionForClient(question, 'en');
};

const serializeQuestionDocForClient = (question = {}, language = 'en') => {
    return serializeQuestionForClient(question, language);
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
    const payload = answer?.answerPayload || {};
    const attempted = Boolean(answer?.selectedOption) || answerPayloadHasValue(payload);
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

    if (type === 'mcq') {
        let selectedOption = String(answer?.selectedOption || '').trim().toUpperCase();
        if (!selectedOption && payload?.kind === 'mcq' && Number.isInteger(payload.selectedOption)) {
            selectedOption = String.fromCharCode(65 + payload.selectedOption);
        }
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
        const userVal = payload.value !== undefined ? payload.value : answer?.selectedOption;
        const normalizedUser = normalizeTextAnswer(userVal);
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
    FORMULA_REGEX,
    detectFormula,
    parseAssertionReason,
    parseStatementQuestion,
    parseMatrixMatch,
    parseFillupSyllables,
    parseOrderQuestion,
    normalizeQuestionType,
    isQuestionTypeGraded,
    buildTypeDataFromImported,
    buildTypeDataFromQuestionDoc,
    serializeQuestionForClient,
    serializeImportedQuestionForClient,
    serializeQuestionDocForClient,
    answerPayloadHasValue,
    evaluateQuestionAttempt,
};
