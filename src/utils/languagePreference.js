const getPreferredLanguage = (req) => (
    String(req?.user?.profile?.preferredLanguage || '').toLowerCase() === 'hi' ? 'hi' : 'en'
);

const pickHindiFallback = (hindiValue, englishValue) => {
    if (typeof hindiValue === 'string' && hindiValue.trim()) return hindiValue;
    if (hindiValue && typeof hindiValue === 'object') return hindiValue;
    return englishValue;
};

const normalizeText = (text) => {
    if (typeof text !== 'string') return text;
    // Handle both literal \n, properly escaped \\n, and even potential /n if used as a delimiter
    return text
        .replace(/\\n/g, '\n')
        .replace(/\\\n/g, '\n')
        .replace(/\s\/n\s/g, '\n') // Handle space-surrounded /n as newline
        .replace(/\/n(?=\s|[A-Z0-9])/g, '\n'); // Handle /n before a space or new sentence
};

const mapImportedQuestionForLanguage = (question, language = 'en') => {
    if (!question) return question;

    const langQuestion = language === 'hi' 
        ? pickHindiFallback(question.questionHi, question.question)
        : question.question;
    
    const langExplanation = language === 'hi'
        ? pickHindiFallback(question.explanationHi, question.explanation)
        : question.explanation;

    const options = ['A', 'B', 'C', 'D'].reduce((acc, key) => {
        const val = language === 'hi'
            ? pickHindiFallback(question.optionsHi?.[key], question.options?.[key] || null)
            : question.options?.[key] || null;
        acc[key] = normalizeText(val);
        return acc;
    }, {});

    return {
        ...question,
        question: normalizeText(langQuestion),
        options,
        explanation: normalizeText(langExplanation),
    };
};

const mapImportedQuestionsForLanguage = (questions = [], language = 'en') => (
    Array.isArray(questions)
        ? questions.map((question) => mapImportedQuestionForLanguage(question, language))
        : []
);

const mapQuestionDocForLanguage = (question, language = 'en') => {
    if (!question) return question;

    const langQuestion = language === 'hi'
        ? pickHindiFallback(question.question?.hi, question.question?.en || question.question)
        : question.question?.en || question.question;

    const langExplanation = language === 'hi'
        ? pickHindiFallback(question.explanation?.hi, question.explanation?.en || question.explanation)
        : question.explanation?.en || question.explanation;

    const options = Array.isArray(question.options)
        ? question.options.map((option) => ({
            ...option,
            text: normalizeText(language === 'hi'
                ? pickHindiFallback(option?.text?.hi, option?.text?.en || option?.text)
                : option?.text?.en || option?.text),
        }))
        : question.options;

    return {
        ...question,
        question: normalizeText(langQuestion),
        explanation: normalizeText(langExplanation),
        options,
    };
};

const mapQuestionDocsForLanguage = (questions = [], language = 'en') => (
    Array.isArray(questions)
        ? questions.map((question) => mapQuestionDocForLanguage(question, language))
        : []
);

const pickFormulaImageForLanguage = (card, language = 'en') => {
    if (language !== 'hi') return card?.imgUrl || '';
    return String(card?.hindiImgUrl || '').trim() || card?.imgUrl || '';
};

module.exports = {
    getPreferredLanguage,
    mapImportedQuestionForLanguage,
    mapImportedQuestionsForLanguage,
    mapQuestionDocForLanguage,
    mapQuestionDocsForLanguage,
    pickFormulaImageForLanguage,
};
