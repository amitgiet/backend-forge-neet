const questions = [
    {
        questionId: 'bio_lw_001',
        question: { en: 'Which of the following is not a defining characteristic of living organisms?', hi: 'निम्नलिखित में से कौन जीव का परिभाषित गुण नहीं है?' },
        options: [
            { key: 'A', text: { en: 'Growth', hi: 'वृद्धि' }, isCorrect: true },
            { key: 'B', text: { en: 'Metabolism', hi: 'चयापचय' }, isCorrect: false },
            { key: 'C', text: { en: 'Cellular organization', hi: 'कोशिकीय संगठन' }, isCorrect: false },
            { key: 'D', text: { en: 'Consciousness', hi: 'चेतना' }, isCorrect: false }
        ],
        correctAnswer: 'A',
        explanation: { en: 'Growth is exhibited by non-living objects also (e.g. accumulation of material). Hence it is not a defining property.', hi: 'वृद्धि निर्जीव वस्तुओं द्वारा भी प्रदर्शित की जा सकती है। अतः यह परिभाषित गुण नहीं है।' },
        subject: 'biology',
        chapterId: 'biology_living_world',
        difficulty: 'easy',
        examTypes: ['NEET_UG']
    },
    {
        questionId: 'bio_lw_002',
        question: { en: 'Binomial Nomenclature was given by:', hi: 'द्विपद नामकरण किसने दिया?' },
        options: [
            { key: 'A', text: { en: 'Darwin', hi: 'डार्विन' }, isCorrect: false },
            { key: 'B', text: { en: 'Linnaeus', hi: 'लीनियस' }, isCorrect: true },
            { key: 'C', text: { en: 'Lamarck', hi: 'लैमैर्क' }, isCorrect: false },
            { key: 'D', text: { en: 'Aristotle', hi: 'अरस्तू' }, isCorrect: false }
        ],
        correctAnswer: 'B',
        explanation: { en: 'Carolus Linnaeus introduced Binomial Nomenclature.', hi: 'कैरोलस लिनियस ने द्विपद नामकरण की शुरुआत की।' },
        subject: 'biology',
        chapterId: 'biology_living_world',
        difficulty: 'easy',
        examTypes: ['NEET_UG']
    },
    {
        questionId: 'phy_um_001',
        question: { en: 'The dimensional formula of Universal Gravitational Constant (G) is:', hi: 'सार्वत्रिक गुरुत्वाकर्षण नियतांक (G) का विमीय सूत्र है:' },
        options: [
            { key: 'A', text: { en: '[M-1 L3 T-2]', hi: '[M-1 L3 T-2]' }, isCorrect: true },
            { key: 'B', text: { en: '[M L2 T-1]', hi: '[M L2 T-1]' }, isCorrect: false },
            { key: 'C', text: { en: '[M-2 L3 T-2]', hi: '[M-2 L3 T-2]' }, isCorrect: false },
            { key: 'D', text: { en: '[M-1 L2 T-2]', hi: '[M-1 L2 T-2]' }, isCorrect: false }
        ],
        correctAnswer: 'A',
        explanation: { en: 'F = Gm1m2/r^2 => G = Fr^2/m1m2. [G] = [MLT-2][L2]/[M2] = [M-1 L3 T-2]', hi: 'F = Gm1m2/r^2 => G = Fr^2/m1m2' },
        subject: 'physics',
        chapterId: 'physics_units_measurements',
        difficulty: 'medium',
        examTypes: ['NEET_UG', 'JEE_MAIN']
    }
];

module.exports = questions;
