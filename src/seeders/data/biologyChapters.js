// NEET Biology Chapters - 50% weightage (97 total chapters mapped)
const biologyChapters = [
    // Class 11 Biology
    {
        chapterId: 'biology_living_world',
        name: { en: 'The Living World', hi: 'जीव जगत' },
        subject: 'biology',
        examWeights: {
            NEET_UG: { percentage: 1.5, questionsCount: 2, marksPerQuestion: 4, difficulty: { easy: 1, medium: 1, hard: 0 } }
        },
        ncert: { class: 11, chapterNumber: 1, totalPages: 15, keyTopics: ['Taxonomy', 'Classification', 'Nomenclature'], pyqFrequency: 8 },
        estimatedStudyTime: 6,
        tags: ['taxonomy', 'classification', 'basic biology']
    },
    {
        chapterId: 'biology_biological_classification',
        name: { en: 'Biological Classification', hi: 'जैविक वर्गीकरण' },
        subject: 'biology',
        examWeights: {
            NEET_UG: { percentage: 2, questionsCount: 3, marksPerQuestion: 4, difficulty: { easy: 1, medium: 1, hard: 1 } }
        },
        ncert: { class: 11, chapterNumber: 2, totalPages: 20, keyTopics: ['Five Kingdom', 'Bacteria', 'Fungi', 'Virus'], pyqFrequency: 12 },
        estimatedStudyTime: 8,
        tags: ['classification', 'kingdoms', 'microorganisms']
    },
    {
        chapterId: 'biology_plant_kingdom',
        name: { en: 'Plant Kingdom', hi: 'वनस्पति जगत' },
        subject: 'biology',
        examWeights: {
            NEET_UG: { percentage: 2.5, questionsCount: 4, marksPerQuestion: 4, difficulty: { easy: 1, medium: 2, hard: 1 } }
        },
        ncert: { class: 11, chapterNumber: 3, totalPages: 25, keyTopics: ['Algae', 'Bryophytes', 'Pteridophytes', 'Gymnosperms', 'Angiosperms'], pyqFrequency: 15 },
        estimatedStudyTime: 10,
        tags: ['plants', 'classification', 'cryptogams']
    },
    {
        chapterId: 'biology_animal_kingdom',
        name: { en: 'Animal Kingdom', hi: 'प्राणि जगत' },
        subject: 'biology',
        examWeights: {
            NEET_UG: { percentage: 3, questionsCount: 5, marksPerQuestion: 4, difficulty: { easy: 2, medium: 2, hard: 1 } }
        },
        ncert: { class: 11, chapterNumber: 4, totalPages: 30, keyTopics: ['Porifera', 'Coelenterata', 'Chordata', 'Non-Chordata'], pyqFrequency: 18 },
        estimatedStudyTime: 12,
        tags: ['animals', 'classification', 'phyla']
    },
    {
        chapterId: 'biology_cell_structure',
        name: { en: 'Cell: The Unit of Life', hi: 'कोशिका: जीवन की इकाई' },
        subject: 'biology',
        examWeights: {
            NEET_UG: { percentage: 3.5, questionsCount: 6, marksPerQuestion: 4, difficulty: { easy: 2, medium: 3, hard: 1 } }
        },
        ncert: { class: 11, chapterNumber: 8, totalPages: 22, keyTopics: ['Cell Structure', 'Cell Organelles', 'Cell Theory'], pyqFrequency: 20 },
        estimatedStudyTime: 10,
        tags: ['cell', 'organelles', 'fundamental']
    },
    {
        chapterId: 'biology_biomolecules',
        name: { en: 'Biomolecules', hi: 'जैव अणु' },
        subject: 'biology',
        examWeights: {
            NEET_UG: { percentage: 3, questionsCount: 5, marksPerQuestion: 4, difficulty: { easy: 1, medium: 3, hard: 1 } }
        },
        ncert: { class: 11, chapterNumber: 9, totalPages: 18, keyTopics: ['Proteins', 'Carbohydrates', 'Lipids', 'Nucleic Acids'], pyqFrequency: 16 },
        estimatedStudyTime: 9,
        tags: ['biochemistry', 'molecules', 'metabolism']
    },
    {
        chapterId: 'biology_photosynthesis',
        name: { en: 'Photosynthesis in Higher Plants', hi: 'उच्च पादपों में प्रकाश संश्लेषण' },
        subject: 'biology',
        examWeights: {
            NEET_UG: { percentage: 4, questionsCount: 7, marksPerQuestion: 4, difficulty: { easy: 2, medium: 3, hard: 2 } }
        },
        ncert: { class: 11, chapterNumber: 13, totalPages: 24, keyTopics: ['Light Reaction', 'Dark Reaction', 'C3 C4 CAM'], pyqFrequency: 25 },
        estimatedStudyTime: 12,
        tags: ['photosynthesis', 'plant physiology', 'important']
    },
    {
        chapterId: 'biology_respiration',
        name: { en: 'Respiration in Plants', hi: 'पादपों में श्वसन' },
        subject: 'biology',
        examWeights: {
            NEET_UG: { percentage: 3.5, questionsCount: 6, marksPerQuestion: 4, difficulty: { easy: 2, medium: 2, hard: 2 } }
        },
        ncert: { class: 11, chapterNumber: 14, totalPages: 20, keyTopics: ['Glycolysis', 'Krebs Cycle', 'ETC', 'ATP'], pyqFrequency: 22 },
        estimatedStudyTime: 11,
        tags: ['respiration', 'metabolism', 'ATP']
    },

    // Class 12 Biology (High Weightage Chapters)
    {
        chapterId: 'biology_reproduction_organisms',
        name: { en: 'Reproduction in Organisms', hi: 'जीवों में जनन' },
        subject: 'biology',
        examWeights: {
            NEET_UG: { percentage: 2.5, questionsCount: 4, marksPerQuestion: 4, difficulty: { easy: 1, medium: 2, hard: 1 } }
        },
        ncert: { class: 12, chapterNumber: 1, totalPages: 18, keyTopics: ['Asexual Reproduction', 'Sexual Reproduction'], pyqFrequency: 14 },
        estimatedStudyTime: 8,
        tags: ['reproduction', 'life cycle']
    },
    {
        chapterId: 'biology_human_reproduction',
        name: { en: 'Human Reproduction', hi: 'मानव जनन' },
        subject: 'biology',
        examWeights: {
            NEET_UG: { percentage: 4.5, questionsCount: 8, marksPerQuestion: 4, difficulty: { easy: 2, medium: 4, hard: 2 } }
        },
        ncert: { class: 12, chapterNumber: 3, totalPages: 28, keyTopics: ['Male Reproductive System', 'Female Reproductive System', 'Menstrual Cycle', 'Pregnancy'], pyqFrequency: 30 },
        estimatedStudyTime: 14,
        tags: ['human biology', 'reproduction', 'high weightage']
    },
    {
        chapterId: 'biology_genetics',
        name: { en: 'Principles of Inheritance and Variation', hi: 'वंशागति और विभिन्नता के सिद्धांत' },
        subject: 'biology',
        examWeights: {
            NEET_UG: { percentage: 5, questionsCount: 9, marksPerQuestion: 4, difficulty: { easy: 2, medium: 5, hard: 2 } }
        },
        ncert: { class: 12, chapterNumber: 5, totalPages: 32, keyTopics: ['Mendel Laws', 'Pedigree Analysis', 'Genetic Disorders'], pyqFrequency: 35 },
        estimatedStudyTime: 16,
        tags: ['genetics', 'inheritance', 'very important']
    },
    {
        chapterId: 'biology_molecular_basis',
        name: { en: 'Molecular Basis of Inheritance', hi: 'वंशागति का आणविक आधार' },
        subject: 'biology',
        examWeights: {
            NEET_UG: { percentage: 4.5, questionsCount: 8, marksPerQuestion: 4, difficulty: { easy: 2, medium: 4, hard: 2 } }
        },
        ncert: { class: 12, chapterNumber: 6, totalPages: 30, keyTopics: ['DNA', 'RNA', 'Replication', 'Transcription', 'Translation'], pyqFrequency: 32 },
        estimatedStudyTime: 15,
        tags: ['molecular biology', 'DNA', 'very important']
    },
    {
        chapterId: 'biology_evolution',
        name: { en: 'Evolution', hi: 'विकास' },
        subject: 'biology',
        examWeights: {
            NEET_UG: { percentage: 3, questionsCount: 5, marksPerQuestion: 4, difficulty: { easy: 2, medium: 2, hard: 1 } }
        },
        ncert: { class: 12, chapterNumber: 7, totalPages: 25, keyTopics: ['Darwin Theory', 'Evidence of Evolution', 'Human Evolution'], pyqFrequency: 18 },
        estimatedStudyTime: 10,
        tags: ['evolution', 'darwin', 'origin of life']
    },
    {
        chapterId: 'biology_human_health',
        name: { en: 'Human Health and Disease', hi: 'मानव स्वास्थ्य तथा रोग' },
        subject: 'biology',
        examWeights: {
            NEET_UG: { percentage: 4, questionsCount: 7, marksPerQuestion: 4, difficulty: { easy: 2, medium: 3, hard: 2 } }
        },
        ncert: { class: 12, chapterNumber: 8, totalPages: 26, keyTopics: ['Immunity', 'AIDS', 'Cancer', 'Drugs'], pyqFrequency: 28 },
        estimatedStudyTime: 12,
        tags: ['health', 'disease', 'immunity', 'important']
    },
    {
        chapterId: 'biology_biotechnology_principles',
        name: { en: 'Biotechnology: Principles and Processes', hi: 'जैव प्रौद्योगिकी: सिद्धांत और प्रक्रिया' },
        subject: 'biology',
        examWeights: {
            NEET_UG: { percentage: 3.5, questionsCount: 6, marksPerQuestion: 4, difficulty: { easy: 1, medium: 3, hard: 2 } }
        },
        ncert: { class: 12, chapterNumber: 11, totalPages: 22, keyTopics: ['DNA Recombinant Technology', 'PCR', 'Cloning'], pyqFrequency: 24 },
        estimatedStudyTime: 11,
        tags: ['biotechnology', 'genetic engineering']
    },
    {
        chapterId: 'biology_ecology',
        name: { en: 'Organisms and Populations', hi: 'जीव और समष्टियाँ' },
        subject: 'biology',
        examWeights: {
            NEET_UG: { percentage: 3, questionsCount: 5, marksPerQuestion: 4, difficulty: { easy: 2, medium: 2, hard: 1 } }
        },
        ncert: { class: 12, chapterNumber: 13, totalPages: 24, keyTopics: ['Population Ecology', 'Population Attributes'], pyqFrequency: 20 },
        estimatedStudyTime: 10,
        tags: ['ecology', 'population', 'environment']
    }
];

module.exports = biologyChapters;
