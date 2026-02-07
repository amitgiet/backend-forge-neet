// NEET Physics Chapters - 25% weightage
const physicsChapters = [
    // Class 11 Physics
    {
        chapterId: 'physics_units_measurements',
        name: { en: 'Units and Measurements', hi: 'मात्रक और माप' },
        subject: 'physics',
        examWeights: {
            NEET_UG: { percentage: 1.5, questionsCount: 2, marksPerQuestion: 4, difficulty: { easy: 1, medium: 1, hard: 0 } },
            JEE_MAIN: { percentage: 2, questionsCount: 2, marksPerQuestion: 4, difficulty: { easy: 1, medium: 1, hard: 0 } }
        },
        ncert: { class: 11, chapterNumber: 1, totalPages: 18, keyTopics: ['SI Units', 'Dimensions', 'Errors'], pyqFrequency: 8 },
        estimatedStudyTime: 6,
        tags: ['measurement', 'basics', 'dimensional analysis']
    },
    {
        chapterId: 'physics_kinematics',
        name: { en: 'Motion in a Straight Line', hi: 'सरल रेखा में गति' },
        subject: 'physics',
        examWeights: {
            NEET_UG: { percentage: 2, questionsCount: 3, marksPerQuestion: 4, difficulty: { easy: 1, medium: 1, hard: 1 } },
            JEE_MAIN: { percentage: 3, questionsCount: 3, marksPerQuestion: 4, difficulty: { easy: 1, medium: 1, hard: 1 } }
        },
        ncert: { class: 11, chapterNumber: 2, totalPages: 22, keyTopics: ['Velocity', 'Acceleration', 'Equations of Motion'], pyqFrequency: 12 },
        estimatedStudyTime: 8,
        tags: ['mechanics', 'kinematics', 'motion']
    },
    {
        chapterId: 'physics_laws_of_motion',
        name: { en: 'Laws of Motion', hi: 'गति के नियम' },
        subject: 'physics',
        examWeights: {
            NEET_UG: { percentage: 3.5, questionsCount: 6, marksPerQuestion: 4, difficulty: { easy: 2, medium: 2, hard: 2 } },
            JEE_MAIN: { percentage: 4.5, questionsCount: 5, marksPerQuestion: 4, difficulty: { easy: 1, medium: 3, hard: 1 } }
        },
        ncert: { class: 11, chapterNumber: 5, totalPages: 28, keyTopics: ['Newton Laws', 'Friction', 'Circular Motion'], pyqFrequency: 22 },
        estimatedStudyTime: 12,
        tags: ['mechanics', 'newton laws', 'important']
    },
    {
        chapterId: 'physics_work_energy_power',
        name: { en: 'Work, Energy and Power', hi: 'कार्य, ऊर्जा और शक्ति' },
        subject: 'physics',
        examWeights: {
            NEET_UG: { percentage: 3, questionsCount: 5, marksPerQuestion: 4, difficulty: { easy: 2, medium: 2, hard: 1 } },
            JEE_MAIN: { percentage: 4, questionsCount: 4, marksPerQuestion: 4, difficulty: { easy: 1, medium: 2, hard: 1 } }
        },
        ncert: { class: 11, chapterNumber: 6, totalPages: 24, keyTopics: ['Work', 'Kinetic Energy', 'Potential Energy', 'Conservation'], pyqFrequency: 18 },
        estimatedStudyTime: 10,
        tags: ['mechanics', 'energy', 'important']
    },
    {
        chapterId: 'physics_gravitation',
        name: { en: 'Gravitation', hi: 'गुरुत्वाकर्षण' },
        subject: 'physics',
        examWeights: {
            NEET_UG: { percentage: 2.5, questionsCount: 4, marksPerQuestion: 4, difficulty: { easy: 1, medium: 2, hard: 1 } },
            JEE_MAIN: { percentage: 3.5, questionsCount: 4, marksPerQuestion: 4, difficulty: { easy: 1, medium: 2, hard: 1 } }
        },
        ncert: { class: 11, chapterNumber: 8, totalPages: 26, keyTopics: ['Universal Gravitation', 'Kepler Laws', 'Satellites'], pyqFrequency: 16 },
        estimatedStudyTime: 10,
        tags: ['gravitation', 'planetary motion']
    },
    {
        chapterId: 'physics_thermodynamics',
        name: { en: 'Thermodynamics', hi: 'ऊष्मागतिकी' },
        subject: 'physics',
        examWeights: {
            NEET_UG: { percentage: 3.5, questionsCount: 6, marksPerQuestion: 4, difficulty: { easy: 2, medium: 2, hard: 2 } },
            JEE_MAIN: { percentage: 4, questionsCount: 5, marksPerQuestion: 4, difficulty: { easy: 1, medium: 3, hard: 1 } }
        },
        ncert: { class: 11, chapterNumber: 12, totalPages: 28, keyTopics: ['First Law', 'Second Law', 'Heat Engines', 'Entropy'], pyqFrequency: 24 },
        estimatedStudyTime: 12,
        tags: ['thermodynamics', 'heat', 'very important']
    },

    // Class 12 Physics (High Weightage)
    {
        chapterId: 'physics_electrostatics',
        name: { en: 'Electric Charges and Fields', hi: 'वैद्युत आवेश और क्षेत्र' },
        subject: 'physics',
        examWeights: {
            NEET_UG: { percentage: 4, questionsCount: 7, marksPerQuestion: 4, difficulty: { easy: 2, medium: 3, hard: 2 } },
            JEE_MAIN: { percentage: 5, questionsCount: 6, marksPerQuestion: 4, difficulty: { easy: 1, medium: 3, hard: 2 } }
        },
        ncert: { class: 12, chapterNumber: 1, totalPages: 30, keyTopics: ['Coulomb Law', 'Electric Field', 'Gauss Law'], pyqFrequency: 28 },
        estimatedStudyTime: 14,
        tags: ['electrostatics', 'electricity', 'very important']
    },
    {
        chapterId: 'physics_current_electricity',
        name: { en: 'Current Electricity', hi: 'विद्युत धारा' },
        subject: 'physics',
        examWeights: {
            NEET_UG: { percentage: 4, questionsCount: 7, marksPerQuestion: 4, difficulty: { easy: 2, medium: 3, hard: 2 } },
            JEE_MAIN: { percentage: 5, questionsCount: 6, marksPerQuestion: 4, difficulty: { easy: 2, medium: 3, hard: 1 } }
        },
        ncert: { class: 12, chapterNumber: 3, totalPages: 28, keyTopics: ['Ohm Law', 'Kirchhoff Laws', 'Wheatstone Bridge'], pyqFrequency: 30 },
        estimatedStudyTime: 14,
        tags: ['electricity', 'circuits', 'very important']
    },
    {
        chapterId: 'physics_magnetism',
        name: { en: 'Magnetism and Matter', hi: 'चुंबकत्व एवं द्रव्य' },
        subject: 'physics',
        examWeights: {
            NEET_UG: { percentage: 3, questionsCount: 5, marksPerQuestion: 4, difficulty: { easy: 2, medium: 2, hard: 1 } },
            JEE_MAIN: { percentage: 3.5, questionsCount: 4, marksPerQuestion: 4, difficulty: { easy: 1, medium: 2, hard: 1 } }
        },
        ncert: { class: 12, chapterNumber: 5, totalPages: 24, keyTopics: ['Bar Magnet', 'Magnetic Properties'], pyqFrequency: 20 },
        estimatedStudyTime: 10,
        tags: ['magnetism', 'magnetic field']
    },
    {
        chapterId: 'physics_optics',
        name: { en: 'Ray Optics and Optical Instruments', hi: 'किरण प्रकाशिकी एवं प्रकाशिक यंत्र' },
        subject: 'physics',
        examWeights: {
            NEET_UG: { percentage: 4.5, questionsCount: 8, marksPerQuestion: 4, difficulty: { easy: 2, medium: 4, hard: 2 } },
            JEE_MAIN: { percentage: 5, questionsCount: 6, marksPerQuestion: 4, difficulty: { easy: 2, medium: 3, hard: 1 } }
        },
        ncert: { class: 12, chapterNumber: 9, totalPages: 32, keyTopics: ['Reflection', 'Refraction', 'Lens Formula', 'Microscope'], pyqFrequency: 32 },
        estimatedStudyTime: 15,
        tags: ['optics', 'light', 'very important']
    },
    {
        chapterId: 'physics_wave_optics',
        name: { en: 'Wave Optics', hi: 'तरंग प्रकाशिकी' },
        subject: 'physics',
        examWeights: {
            NEET_UG: { percentage: 2.5, questionsCount: 4, marksPerQuestion: 4, difficulty: { easy: 1, medium: 2, hard: 1 } },
            JEE_MAIN: { percentage: 3, questionsCount: 3, marksPerQuestion: 4, difficulty: { easy: 1, medium: 1, hard: 1 } }
        },
        ncert: { class: 12, chapterNumber: 10, totalPages: 20, keyTopics: ['Interference', 'Diffraction', 'Polarization'], pyqFrequency: 16 },
        estimatedStudyTime: 9,
        tags: ['optics', 'waves', 'interference']
    },
    {
        chapterId: 'physics_modern_physics',
        name: { en: 'Dual Nature of Radiation and Matter', hi: 'विकिरण और द्रव्य की द्वैत प्रकृति' },
        subject: 'physics',
        examWeights: {
            NEET_UG: { percentage: 3, questionsCount: 5, marksPerQuestion: 4, difficulty: { easy: 1, medium: 3, hard: 1 } },
            JEE_MAIN: { percentage: 3.5, questionsCount: 4, marksPerQuestion: 4, difficulty: { easy: 1, medium: 2, hard: 1 } }
        },
        ncert: { class: 12, chapterNumber: 11, totalPages: 22, keyTopics: ['Photoelectric Effect', 'de Broglie', 'Davisson-Germer'], pyqFrequency: 18 },
        estimatedStudyTime: 10,
        tags: ['modern physics', 'quantum', 'photoelectric']
    },
    {
        chapterId: 'physics_atoms',
        name: { en: 'Atoms', hi: 'परमाणु' },
        subject: 'physics',
        examWeights: {
            NEET_UG: { percentage: 2.5, questionsCount: 4, marksPerQuestion: 4, difficulty: { easy: 1, medium: 2, hard: 1 } },
            JEE_MAIN: { percentage: 3, questionsCount: 3, marksPerQuestion: 4, difficulty: { easy: 1, medium: 1, hard: 1 } }
        },
        ncert: { class: 12, chapterNumber: 12, totalPages: 18, keyTopics: ['Bohr Model', 'Hydrogen Atom', 'Spectral Lines'], pyqFrequency: 14 },
        estimatedStudyTime: 8,
        tags: ['modern physics', 'atomic structure']
    },
    {
        chapterId: 'physics_nuclei',
        name: { en: 'Nuclei', hi: 'नाभिक' },
        subject: 'physics',
        examWeights: {
            NEET_UG: { percentage: 3, questionsCount: 5, marksPerQuestion: 4, difficulty: { easy: 2, medium: 2, hard: 1 } },
            JEE_MAIN: { percentage: 3.5, questionsCount: 4, marksPerQuestion: 4, difficulty: { easy: 1, medium: 2, hard: 1 } }
        },
        ncert: { class: 12, chapterNumber: 13, totalPages: 24, keyTopics: ['Radioactivity', 'Nuclear Reactions', 'Binding Energy'], pyqFrequency: 20 },
        estimatedStudyTime: 10,
        tags: ['nuclear physics', 'radioactivity']
    },
    {
        chapterId: 'physics_semiconductors',
        name: { en: 'Semiconductor Electronics', hi: 'अर्धचालक इलेक्ट्रॉनिकी' },
        subject: 'physics',
        examWeights: {
            NEET_UG: { percentage: 3.5, questionsCount: 6, marksPerQuestion: 4, difficulty: { easy: 2, medium: 2, hard: 2 } },
            JEE_MAIN: { percentage: 4, questionsCount: 5, marksPerQuestion: 4, difficulty: { easy: 1, medium: 3, hard: 1 } }
        },
        ncert: { class: 12, chapterNumber: 14, totalPages: 26, keyTopics: ['PN Junction', 'Diode', 'Transistor', 'Logic Gates'], pyqFrequency: 22 },
        estimatedStudyTime: 12,
        tags: ['electronics', 'semiconductors', 'important']
    }
];

module.exports = physicsChapters;
