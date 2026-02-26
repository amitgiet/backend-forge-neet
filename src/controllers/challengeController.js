const ChallengeService = require('../services/challengeService');

const challengeService = new ChallengeService();

exports.createChallenge = async (req, res) => {
    try {
        const userId = req.user._id;
        const challengeData = req.body;
        
        const challenge = await challengeService.createChallenge(userId, challengeData);
        
        res.status(201).json({
            success: true,
            data: challenge
        });
    } catch (error) {
        console.error('Error creating challenge:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create challenge'
        });
    }
};

exports.getUserChallenges = async (req, res) => {
    try {
        const userId = req.user._id;
        
        const challenges = await challengeService.getUserChallenges(userId);
        
        res.json({
            success: true,
            data: challenges
        });
    } catch (error) {
        console.error('Error fetching challenges:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch challenges'
        });
    }
};

exports.getChallengeById = async (req, res) => {
    try {
        const userId = req.user._id;
        const { challengeId } = req.params;
        
        const challenge = await challengeService.getChallengeById(challengeId, userId);
        
        if (!challenge) {
            return res.status(404).json({
                success: false,
                message: 'Challenge not found'
            });
        }
        
        res.json({
            success: true,
            data: challenge
        });
    } catch (error) {
        console.error('Error fetching challenge:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch challenge'
        });
    }
};

exports.getTodaySchedule = async (req, res) => {
    try {
        const userId = req.user._id;
        const { challengeId } = req.params;
        
        const result = await challengeService.getTodaySchedule(challengeId, userId);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error fetching today schedule:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch today schedule'
        });
    }
};

exports.completeQuiz = async (req, res) => {
    try {
        const userId = req.user._id;
        const { challengeId, dayNumber, quizIndex } = req.params;
        const { score, timeSpent, correctAnswers, totalQuizzes } = req.body;
        
        const challenge = await challengeService.completeQuiz(
            challengeId,
            userId,
            parseInt(dayNumber),
            parseInt(quizIndex),
            score,
            timeSpent,
            correctAnswers,
            totalQuizzes
        );
        
        res.json({
            success: true,
            data: challenge
        });
    } catch (error) {
        console.error('Error completing quiz:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to complete quiz'
        });
    }
};

exports.deleteChallenge = async (req, res) => {
    try {
        const userId = req.user._id;
        const { challengeId } = req.params;
        
        const result = await challengeService.deleteChallenge(challengeId, userId);
        
        res.json({
            success: true,
            message: result.message
        });
    } catch (error) {
        console.error('Error deleting challenge:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete challenge'
        });
    }
};
