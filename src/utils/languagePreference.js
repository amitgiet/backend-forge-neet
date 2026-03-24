const getPreferredLanguage = (req) => (
    String(req?.user?.profile?.preferredLanguage || '').toLowerCase() === 'hi' ? 'hi' : 'en'
);

const pickHindiFallback = (hindiValue, englishValue) => {
    if (typeof hindiValue === 'string' && hindiValue.trim()) return hindiValue;
    if (hindiValue && typeof hindiValue === 'object') return hindiValue;
    return englishValue;
};

const mapImportedQuestionForLanguage = (question, language = 'en') => {
    if (!question || language !== 'hi') return question;

    const options = ['A', 'B', 'C', 'D'].reduce((acc, key) => {
        acc[key] = pickHindiFallback(question.optionsHi?.[key], question.options?.[key] || null);
        return acc;
    }, {});

    return {
        ...question,
        question: pickHindiFallback(question.questionHi, question.question),
        options,
        explanation: pickHindiFallback(question.explanationHi, question.explanation),
    };
};

const mapImportedQuestionsForLanguage = (questions = [], language = 'en') => (
    Array.isArray(questions)
        ? questions.map((question) => mapImportedQuestionForLanguage(question, language))
        : []
);

const mapQuestionDocForLanguage = (question, language = 'en') => {
    if (!question || language !== 'hi') return question;

    return {
        ...question,
        question: pickHindiFallback(question.question?.hi, question.question?.en || question.question),
        explanation: pickHindiFallback(question.explanation?.hi, question.explanation?.en || question.explanation),
        options: Array.isArray(question.options)
            ? question.options.map((option) => ({
                ...option,
                text: pickHindiFallback(option?.text?.hi, option?.text?.en || option?.text),
            }))
            : question.options,
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
