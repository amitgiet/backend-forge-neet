const LearningPath = require('../models/LearningPath');
const NCERTLine = require('../models/NCERTLine');
const UserLine = require('../models/UserLine');
const GeminiService = require('./geminiService');

class LearningPathService {
    constructor() {
        this.geminiService = new GeminiService();
    }

    async createLearningPath(userId, pathData) {
        const { title, description, goals, dailyGoal } = pathData;
        
        const learningPath = new LearningPath({
            userId,
            title,
            description,
            goals,
            dailyGoal,
            startedAt: new Date()
        });
        
        // Generate content based on goals
        const generatedContent = await this.generateContentForGoals(goals);
        learningPath.generatedContent = generatedContent;
        learningPath.progress.totalItems = generatedContent.length;
        
        await learningPath.save();
        return learningPath;
    }

    async generateContentForGoals(goals) {
        const allContent = [];
        let order = 0;
        
        for (const goal of goals) {
            // Find relevant NCERT lines
            const query = {
                isActive: true,
                $or: [
                    { ncertText: { $regex: goal.topic, $options: 'i' } },
                    { conceptTags: { $regex: goal.topic, $options: 'i' } }
                ]
            };
            
            if (goal.subject) {
                query.subject = goal.subject;
            }
            
            const ncertLines = await NCERTLine.find(query).limit(20);
            
            // Add NCERT lines to content
            for (const line of ncertLines) {
                allContent.push({
                    contentType: 'ncert_line',
                    lineId: line._id,
                    topic: goal.topic,
                    order: order++,
                    status: 'pending'
                });
            }
        }
        
        return allContent;
    }

    async getUserPaths(userId) {
        return await LearningPath.find({ userId, isActive: true })
            .sort({ createdAt: -1 })
            .populate('generatedContent.lineId');
    }

    async getPathById(pathId, userId) {
        return await LearningPath.findOne({ _id: pathId, userId })
            .populate('generatedContent.lineId');
    }

    async getNextContent(pathId, userId) {
        const path = await LearningPath.findOne({ _id: pathId, userId })
            .populate('generatedContent.lineId');
        
        if (!path) throw new Error('Learning path not found');
        
        const currentContent = path.generatedContent[path.progress.currentIndex];
        
        if (!currentContent) {
            return { completed: true, message: 'Learning path completed!' };
        }
        
        return {
            completed: false,
            content: currentContent,
            progress: {
                current: path.progress.currentIndex + 1,
                total: path.progress.totalItems
            }
        };
    }

    async markContentComplete(pathId, userId, contentIndex) {
        const path = await LearningPath.findOne({ _id: pathId, userId });
        
        if (!path) throw new Error('Learning path not found');
        
        path.generatedContent[contentIndex].status = 'completed';
        path.progress.completedItems += 1;
        path.progress.currentIndex = contentIndex + 1;
        
        // Check if path is fully completed
        if (path.progress.completedItems === path.progress.totalItems) {
            path.completedAt = new Date();
        }
        
        await path.save();
        return path;
    }

    async updatePathProgress(pathId, userId, progressData) {
        const path = await LearningPath.findOne({ _id: pathId, userId });
        
        if (!path) throw new Error('Learning path not found');
        
        if (progressData.currentIndex !== undefined) {
            path.progress.currentIndex = progressData.currentIndex;
        }
        
        await path.save();
        return path;
    }

    async deletePath(pathId, userId) {
        const path = await LearningPath.findOne({ _id: pathId, userId });
        
        if (!path) throw new Error('Learning path not found');
        
        path.isActive = false;
        await path.save();
        
        return { message: 'Learning path deleted successfully' };
    }
}

module.exports = LearningPathService;
