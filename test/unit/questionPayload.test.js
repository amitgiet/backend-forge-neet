const {
    detectFormula,
    parseAssertionReason,
    parseStatementQuestion,
    parseMatrixMatch,
    parseFillupSyllables,
    parseOrderQuestion,
    serializeQuestionForClient,
    evaluateQuestionAttempt,
} = require('../../src/utils/questionPayload');

describe('Backend Question Payload & Normalization Suite', () => {
    describe('detectFormula', () => {
        test('detects inline LaTeX math formulas', () => {
            expect(detectFormula('Calculate the energy $E = mc^2$ for the given mass.')).toBe(true);
        });

        test('detects block LaTeX math formulas', () => {
            expect(detectFormula('The kinetic energy is given by: $$\\frac{1}{2}mv^2$$')).toBe(true);
        });

        test('detects LaTeX command fragments in options or explanation', () => {
            expect(detectFormula('Find the value', { A: '\\sqrt{3}/2', B: '1' }, '')).toBe(true);
            expect(detectFormula('Plain question', { A: '1', B: '2' }, 'Explanation with \\Delta H')).toBe(true);
        });

        test('detects Unicode scientific symbols (π, √, θ, Ω, etc.)', () => {
            expect(detectFormula('Find the angle θ for maximum range')).toBe(true);
            expect(detectFormula('The circumference is 2πr')).toBe(true);
        });

        test('returns false for plain non-mathematical text', () => {
            expect(detectFormula('Which of the following is a mammal?', { A: 'Whale', B: 'Shark' }, 'Whales are placental mammals.')).toBe(false);
        });
    });

    describe('parseAssertionReason', () => {
        test('correctly parses standard Assertion(A) and Reason(R) with intro header', () => {
            const raw = 'Consider the following Assertion(A) and Reason(R): \n\nA: All vertebrates are chordates but all chordates are not vertebrates. \n\nR: The members of subphylum Vertebrata possess notochord only during the embryonic period. \nChoose the correct statement:';
            const parsed = parseAssertionReason(raw);
            expect(parsed).not.toBeNull();
            expect(parsed.assertion).toBe('All vertebrates are chordates but all chordates are not vertebrates.');
            expect(parsed.reason).toBe('The members of subphylum Vertebrata possess notochord only during the embryonic period.');
            expect(parsed.standardOptions).toBe(true);
        });

        test('correctly parses Assertion: and Reason: format', () => {
            const raw = 'Assertion (A): Mitochondria are called the powerhouse of the cell.\nReason (R): ATP is synthesized inside mitochondria.\nSelect the correct option:';
            const parsed = parseAssertionReason(raw);
            expect(parsed).not.toBeNull();
            expect(parsed.assertion).toBe('Mitochondria are called the powerhouse of the cell.');
            expect(parsed.reason).toBe('ATP is synthesized inside mitochondria.');
        });

        test('returns null for non assertion-reason questions', () => {
            expect(parseAssertionReason('What is the powerhouse of the cell?')).toBeNull();
        });
    });

    describe('parseStatementQuestion', () => {
        test('correctly parses Statement I and Statement II clauses', () => {
            const raw = 'Given below are two statements: Statement I: Ligaments attach bones to bones. Statement II: Tendons attach muscles to bones. In the light of the above statements choose the correct answer:';
            const parsed = parseStatementQuestion(raw);
            expect(parsed).not.toBeNull();
            expect(parsed.statement1).toBe('Ligaments attach bones to bones.');
            expect(parsed.statement2).toBe('Tendons attach muscles to bones.');
        });

        test('returns null for questions that do not have Statement I and II', () => {
            expect(parseStatementQuestion('Which statement is correct about photosynthesis?')).toBeNull();
        });
    });

    describe('parseMatrixMatch', () => {
        test('correctly parses Match the following Column I and Column II with option codes', () => {
            const questionText = 'Match the following events that occur in their respective phases of cell cycle and select the correct option:\n\nColumn I - Column II\n\n(a) G 1 phase - (i) Cell growth and organelle duplication \n\n(b) S phase - (ii) DNA replication and chromosome duplication\n\n(c) G 2 phase - (iii) Alignment of chromosomes at equator \n\n(d) Metaphase in M- phase - (iv) Protein synthesis';
            const options = {
                A: 'a-(i), b-(ii), c-(iv), d-(iii)',
                B: 'a-(i), b-(ii), c-(iii), d-(iv)',
                C: 'a-(ii), b-(i), c-(iv), d-(iii)',
                D: 'a-(iii), b-(ii), c-(iv), d-(i)',
            };
            const parsed = parseMatrixMatch(questionText, options);
            expect(parsed).not.toBeNull();
            expect(parsed.pairs.length).toBe(4);
            expect(parsed.pairs[0].leftText).toBe('G 1 phase');
            expect(parsed.pairs[0].rightText).toBe('Cell growth and organelle duplication');
            expect(parsed.isMatrixMCQ).toBe(true);
            expect(parsed.matrixOptions.A).toBe('a-(i), b-(ii), c-(iv), d-(iii)');
        });

        test('returns null when no column match header is present', () => {
            expect(parseMatrixMatch('Which option matches the correct hormone?')).toBeNull();
        });
    });

    describe('parseFillupSyllables', () => {
        test('extracts correct syllables and distractor tokens', () => {
            const options = { A: 'cl,oa,ca' };
            const correctAnswer = 'cloaca';
            const parsed = parseFillupSyllables(options, correctAnswer);
            expect(parsed.syllableTokens).toEqual(['cl', 'oa', 'ca']);
            expect(parsed.distractorTokens).toEqual([]);
        });

        test('distinguishes syllable tokens from distractors', () => {
            const options = { A: 'Sys,te,ma, Na,tu,rae,bio,lo,gy' };
            const correctAnswer = 'Systema Naturae';
            const parsed = parseFillupSyllables(options, correctAnswer);
            expect(parsed.syllableTokens.length).toBeGreaterThan(0);
            expect(parsed.distractorTokens).toEqual(['bio', 'lo', 'gy']);
        });

        test('returns empty arrays when options.A is absent', () => {
            expect(parseFillupSyllables({}, 'test')).toEqual({ syllableTokens: [], distractorTokens: [] });
        });
    });

    describe('parseOrderQuestion (154/154 Resurrection)', () => {
        test('resurrects sequential ordering items and determines correct sequence', () => {
            const options = {
                A: '1,Plasmogamy',
                B: '2,Karyogamy',
                C: '3,Meiosis',
                D: null,
            };
            const parsed = parseOrderQuestion(options, 'Plasmogamy > Karyogamy > Meiosis');
            expect(parsed).not.toBeNull();
            expect(parsed.items.length).toBe(3);
            expect(parsed.items[0]).toEqual({ id: 'A', stepNumber: 1, text: 'Plasmogamy' });
            expect(parsed.items[1]).toEqual({ id: 'B', stepNumber: 2, text: 'Karyogamy' });
            expect(parsed.items[2]).toEqual({ id: 'C', stepNumber: 3, text: 'Meiosis' });
            expect(parsed.correctOrder).toEqual(['A', 'B', 'C']);
            expect(parsed.correctSequence).toEqual(['Plasmogamy', 'Karyogamy', 'Meiosis']);
        });

        test('returns null when fewer than 2 valid items exist', () => {
            expect(parseOrderQuestion({ A: '1,OnlyOne' }, 'OnlyOne')).toBeNull();
        });
    });

    describe('serializeQuestionForClient', () => {
        test('enriches latent Assertion-Reason question within mcq type', () => {
            const raw = {
                _id: 'q_ar_1',
                type: 'mcq',
                question: 'Consider the following Assertion(A) and Reason(R): \n\nA: All vertebrates are chordates. \n\nR: Notochord is replaced. \nChoose the correct statement:',
                options: {
                    A: 'Both A and R are true and R is the correct explanation of A',
                    B: 'Both A and R are true but R is not the correct explanation of A',
                    C: 'A is true but R is false',
                    D: 'Both A and R are false',
                },
                correct_option: 'A',
                explanation: 'Vertebrates belong to chordates with a vertebral column.',
            };

            const serialized = serializeQuestionForClient(raw);
            expect(serialized.type).toBe('mcq');
            expect(serialized.typeData.kind).toBe('assertion_reason');
            expect(serialized.typeData.assertionReason.assertion).toBe('All vertebrates are chordates.');
            expect(serialized.typeData.assertionReason.reason).toBe('Notochord is replaced.');
            expect(serialized.isSupported).toBe(true);
        });

        test('enriches fillup question with syllable token rack', () => {
            const raw = {
                _id: 'q_fill_1',
                type: 'fillup',
                question: 'Urinary and reproductive tracts open into _______',
                options: { A: 'cl,oa,ca' },
                correct_answer: 'cloaca',
            };

            const serialized = serializeQuestionForClient(raw);
            expect(serialized.typeData.syllables).toBeDefined();
            expect(serialized.typeData.syllables.syllableTokens).toEqual(['cl', 'oa', 'ca']);
            expect(serialized.typeData.syllables.tokenRack).toHaveLength(3);
        });

        test('resurrects order question from options', () => {
            const raw = {
                _id: 'q_order_1',
                type: 'order',
                question: 'The correct order in sexual stages of fungi is',
                options: {
                    A: '1,Plasmogamy',
                    B: '2,Karyogamy',
                    C: '3,Meiosis',
                },
                correct_answer: 'Plasmogamy > Karyogamy > Meiosis',
                isSupported: false,
                unsupportedReason: 'Order items are not stored for this question yet',
            };

            const serialized = serializeQuestionForClient(raw);
            expect(serialized.isSupported).toBe(true);
            expect(serialized.unsupportedReason).toBeNull();
            expect(serialized.typeData.items).toHaveLength(3);
            expect(serialized.typeData.correctOrder).toEqual(['A', 'B', 'C']);
        });

        test('preserves diagram image URLs at top-level', () => {
            const raw = {
                _id: 'q_img_1',
                type: 'mcq',
                question: 'Identify the organelle shown in the diagram',
                imageUrl: 'https://storage.googleapis.com/memoneet/q_img.png',
                explanationImageUrl: 'https://storage.googleapis.com/memoneet/e_img.png',
                options: { A: 'Mitochondria', B: 'Chloroplast', C: 'Ribosome', D: 'Golgi' },
                correct_option: 'A',
            };

            const serialized = serializeQuestionForClient(raw);
            expect(serialized.imageUrl).toBe('https://storage.googleapis.com/memoneet/q_img.png');
            expect(serialized.explanationImageUrl).toBe('https://storage.googleapis.com/memoneet/e_img.png');
        });
    });

    describe('evaluateQuestionAttempt', () => {
        test('evaluates MCQ using answerPayload numeric selectedOption', () => {
            const question = {
                type: 'mcq',
                correctAnswer: 'A',
                typeData: { correctOption: 'A' },
            };
            const answer = {
                answerPayload: { kind: 'mcq', selectedOption: 0 },
            };
            const result = evaluateQuestionAttempt(question, answer, { marksPerQuestion: 4 });
            expect(result.attempted).toBe(true);
            expect(result.isCorrect).toBe(true);
            expect(result.marksAwarded).toBe(4);
        });

        test('evaluates Order question correctly', () => {
            const question = {
                type: 'order',
                typeData: { correctOrder: ['A', 'B', 'C'] },
            };
            const answer = {
                answerPayload: { kind: 'order', orderedIds: ['A', 'B', 'C'] },
            };
            const result = evaluateQuestionAttempt(question, answer, { marksPerQuestion: 4 });
            expect(result.isCorrect).toBe(true);
            expect(result.marksAwarded).toBe(4);
        });
    });
});
