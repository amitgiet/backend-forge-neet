'use strict';

const flashcardService = require('../services/flashcardService');

exports.getFlashcardSubjects = async (req, res, next) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const subjects = await flashcardService.getSubjects(userId);
        res.status(200).json({
            success: true,
            data: subjects,
        });
    } catch (err) {
        next(err);
    }
};

exports.getChapterDeck = async (req, res, next) => {
    try {
        const { chapterTitle } = req.params;
        const userId = req.user?._id || req.user?.id;
        const result = await flashcardService.getChapterDeck(chapterTitle, userId, req.query);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

exports.getDueDeck = async (req, res, next) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const result = await flashcardService.getDueDeck(userId, req.query);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

exports.syncBatchProgress = async (req, res, next) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const result = await flashcardService.syncBatchProgress(userId, req.body);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

exports.updateCardProgress = async (req, res, next) => {
    try {
        const { cardId } = req.params;
        const userId = req.user?._id || req.user?.id;
        const result = await flashcardService.updateCardProgress(userId, cardId, req.body);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

exports.getHubSummary = async (req, res, next) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const result = await flashcardService.getHubSummary(userId);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};
