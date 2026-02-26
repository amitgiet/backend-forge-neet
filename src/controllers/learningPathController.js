const LearningPathService = require('../services/learningPathService');

const learningPathService = new LearningPathService();

exports.createPath = async (req, res) => {
    try {
        const userId = req.user._id;
        const pathData = req.body;
        
        const learningPath = await learningPathService.createLearningPath(userId, pathData);
        
        res.status(201).json({
            success: true,
            data: learningPath
        });
    } catch (error) {
        console.error('Error creating learning path:', error);
        if (error.message && error.message.includes('No NCERT content found')) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create learning path'
        });
    }
};

exports.getUserPaths = async (req, res) => {
    try {
        const userId = req.user._id;
        
        const paths = await learningPathService.getUserPaths(userId);
        
        res.json({
            success: true,
            data: paths
        });
    } catch (error) {
        console.error('Error fetching learning paths:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch learning paths'
        });
    }
};

exports.getPathById = async (req, res) => {
    try {
        const userId = req.user._id;
        const { pathId } = req.params;
        
        const path = await learningPathService.getPathById(pathId, userId);
        
        if (!path) {
            return res.status(404).json({
                success: false,
                message: 'Learning path not found'
            });
        }
        
        res.json({
            success: true,
            data: path
        });
    } catch (error) {
        console.error('Error fetching learning path:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch learning path'
        });
    }
};

exports.getNextContent = async (req, res) => {
    try {
        const userId = req.user._id;
        const { pathId } = req.params;
        
        const result = await learningPathService.getNextContent(pathId, userId);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error fetching next content:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch next content'
        });
    }
};

exports.markContentComplete = async (req, res) => {
    try {
        const userId = req.user._id;
        const { pathId, contentIndex } = req.params;
        
        const path = await learningPathService.markContentComplete(pathId, userId, parseInt(contentIndex));
        
        res.json({
            success: true,
            data: path
        });
    } catch (error) {
        console.error('Error marking content complete:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to mark content complete'
        });
    }
};

exports.updateProgress = async (req, res) => {
    try {
        const userId = req.user._id;
        const { pathId } = req.params;
        const progressData = req.body;
        
        const path = await learningPathService.updatePathProgress(pathId, userId, progressData);
        
        res.json({
            success: true,
            data: path
        });
    } catch (error) {
        console.error('Error updating progress:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update progress'
        });
    }
};

exports.deletePath = async (req, res) => {
    try {
        const userId = req.user._id;
        const { pathId } = req.params;
        
        const result = await learningPathService.deletePath(pathId, userId);
        
        res.json({
            success: true,
            message: result.message
        });
    } catch (error) {
        console.error('Error deleting learning path:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete learning path'
        });
    }
};
