const QuizGeneratorService = require('../services/quizGeneratorService');
const ErrorResponse = require('../utils/errorResponse');

/**
 * @desc    Generate AI quiz for a topic
 * @route   POST /api/quiz-generator/generate
 * @access  Private
 */
exports.generateQuiz = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { topic, level, numberOfQuestions, quizType = 'mcq' } = req.body;

    console.log('[generateQuiz] Request received:', {
      userId,
      topic,
      level,
      numberOfQuestions,
      quizType,
      timestamp: new Date().toISOString()
    });

    // Validation
    if (!topic || !level || !numberOfQuestions) {
      return next(new ErrorResponse('Topic, level, and numberOfQuestions are required', 400));
    }

    if (level < 1 || level > 7) {
      return next(new ErrorResponse('Level must be between 1 and 7', 400));
    }

    if (numberOfQuestions < 1 || numberOfQuestions > 100) {
      return next(new ErrorResponse('Number of questions must be between 1 and 100', 400));
    }

    const validQuizTypes = ['mcq', 'multiple_select'];
    if (!validQuizTypes.includes(quizType)) {
      return next(new ErrorResponse('Invalid quiz type. Supported types: mcq, multiple_select', 400));
    }

    const result = await QuizGeneratorService.generateQuizForTopic(
      userId,
      topic,
      level,
      numberOfQuestions,
      quizType
    );

    console.log('[generateQuiz] Response sent to frontend:', {
      userId,
      quizId: result.quizId,
      topic: result.topic,
      totalQuestions: result.totalQuestions,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[generateQuiz] Error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    next(new ErrorResponse(error.message, 500));
  }
};

/**
 * @desc    Get quiz by ID
 * @route   GET /api/quiz-generator/:quizId
 * @access  Private
 */
exports.getQuiz = async (req, res, next) => {
  try {
    const { quizId } = req.params;

    const quiz = await QuizGeneratorService.getQuizById(quizId);

    res.status(200).json({
      success: true,
      data: quiz
    });
  } catch (error) {
    next(new ErrorResponse(error.message, 404));
  }
};

/**
 * @desc    Get all quizzes for user
 * @route   GET /api/quiz-generator/quizzes/list
 * @access  Private
 */
exports.getUserQuizzes = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    console.log('[getUserQuizzes] Request received:', {
      userId: userId.toString(),
      page,
      limit,
      timestamp: new Date().toISOString()
    });

    const result = await QuizGeneratorService.getUserQuizzes(userId, page, limit);

    console.log('[getUserQuizzes] Response sent:', {
      userId: userId.toString(),
      quizzesCount: result.quizzes.length,
      pagination: result.pagination,
      quizzesData: JSON.stringify(result.quizzes.slice(0, 1), null, 2), // Log first quiz for debugging
      timestamp: new Date().toISOString()
    });

    res.status(200).json({
      success: true,
      data: result.quizzes,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('[getUserQuizzes] Error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    next(new ErrorResponse(error.message, 500));
  }
};

/**
 * @desc    Submit quiz attempt
 * @route   POST /api/quiz-generator/:quizId/submit
 * @access  Private
 */
exports.submitQuizAttempt = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { quizId } = req.params;
    const { answers, timeTaken } = req.body;

    if (!answers || !Array.isArray(answers)) {
      return next(new ErrorResponse('Answers array is required', 400));
    }

    const result = await QuizGeneratorService.submitQuizAttempt(
      quizId,
      userId,
      answers,
      timeTaken || 0
    );

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(new ErrorResponse(error.message, 500));
  }
};

/**
 * @desc    Delete a quiz
 * @route   DELETE /api/quiz-generator/:quizId
 * @access  Private
 */
exports.deleteQuiz = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { quizId } = req.params;

    const result = await QuizGeneratorService.deleteQuiz(quizId, userId);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(new ErrorResponse(error.message, 500));
  }
};

/**
 * @desc    Get quiz statistics
 * @route   GET /api/quiz-generator/:quizId/stats
 * @access  Private
 */
exports.getQuizStats = async (req, res, next) => {
  try {
    const { quizId } = req.params;

    const quiz = await QuizGeneratorService.getQuizById(quizId);

    const stats = {
      quizId: quiz._id,
      topic: quiz.topic,
      totalAttempts: quiz.totalAttempts,
      avgScore: quiz.avgScore,
      totalMarks: quiz.totalMarks,
      attempts: quiz.attempts.map(a => ({
        attemptDate: a.attemptDate,
        score: a.score,
        percentage: a.percentage,
        timeTaken: a.timeTaken
      }))
    };

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(new ErrorResponse(error.message, 500));
  }
};
