const { generateMicroQuizzes } = require('../services/geminiService');
const Quiz = require('../models/Quiz');

exports.generateOrGetQuiz = async (req, res) => {
    try {
        const { lineId } = req.params;
        const userId = req.user._id;

        // Check if quiz already exists for this line
        let existingQuiz = await Quiz.findOne({ lineId }).lean();
        
        if (existingQuiz) {
            return res.json({
                success: true,
                data: {
                    quizId: existingQuiz._id,
                    questions: existingQuiz.questions,
                    cached: true
                }
            });
        }

        // Generate new quiz using AI
        const questions = await generateMicroQuizzes(lineId);
        
        // Save quiz for future use
        const newQuiz = await Quiz.create({
            lineId,
            questions,
            createdBy: userId,
            type: 'ai-generated'
        });

        return res.json({
            success: true,
            data: {
                quizId: newQuiz._id,
                questions: newQuiz.questions,
                cached: false
            }
        });

    } catch (error) {
        console.error('Generate or get quiz error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate quiz',
            error: error.message
        });
    }
};
