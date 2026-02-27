const mongoose = require("mongoose");
const QuizFactoryService = require("./quizFactoryService");
const QuizMeta = require("../models/QuizMeta");

class QuizGeneratorService {
  /**
   * Generate a quiz using AI for a given topic
   */
  static async generateQuizForTopic(
    userId,
    topic,
    level,
    numberOfQuestions,
    quizType = "mcq",
  ) {
    try {
      const inferSubject = (text) => {
        const t = String(text || "").toLowerCase();
        if (t.includes("organic") || t.includes("inorganic") || t.includes("chem")) return "chemistry";
        if (t.includes("photosynthesis") || t.includes("genetics") || t.includes("reproduction") || t.includes("biology") || t.includes("cell")) return "biology";
        if (t.includes("mechanics") || t.includes("thermo") || t.includes("electric") || t.includes("magnet") || t.includes("physics")) return "physics";
        return "physics";
      };

      const subject = inferSubject(topic);
      const difficulty =
        Number(level) <= 2 ? "easy" : Number(level) <= 4 ? "medium" : "hard";

      const { chapterId, questionIds } =
        await QuizFactoryService.generateQuestionsWithAI({
          subject,
          topic,
          count: numberOfQuestions,
          difficulty,
          examTypes: ["NEET_UG"],
        });

      const quiz = await QuizFactoryService.createQuiz({
        ownerUserId: userId,
        topic,
        subject,
        chapterId,
        source: "quiz-generator",
        quizType,
        level,
        difficulty,
        questionIds,
        isPublished: true,
        tags: [String(topic || "").toLowerCase()].filter(Boolean),
      });

      const payload = await this.getQuizById(quiz._id.toString());
      return {
        success: true,
        _id: quiz._id.toString(),
        quizId: quiz._id.toString(),
        topic: quiz.topic,
        level: quiz.level,
        totalQuestions: quiz.totalQuestions,
        duration: quiz.duration,
        questions: payload.questions,
        message: `Quiz generated successfully with ${quiz.totalQuestions} questions`,
      };
    } catch (error) {
      console.error("Quiz generation error:", error.message);
      console.error("Stack:", error.stack);
      throw new Error(`Failed to generate quiz: ${error.message}`);
    }
  }

  /**
   * Build the prompt for Gemini AI
   * Tailored for NEET exam preparation (Physics, Chemistry, Biology)
   */
  static buildQuizGenerationPrompt(topic, level, numberOfQuestions, quizType) {
    const levelDescriptions = {
      1: "very basic and foundational (Class 10-11 level)",
      2: "basic NCERT level",
      3: "intermediate NEET preparation level",
      4: "intermediate-advanced NEET level",
      5: "advanced NEET level (competitive exam standard)",
      6: "highly advanced NEET level (challenging questions)",
      7: "expert NEET/JEE level (most difficult/tricky questions)",
    };

    const quizTypeDescriptions = {
      mcq: "Multiple Choice Questions (MCQ) with 4 options each - ONE correct answer",
      multiple_select:
        "Multiple Select Questions - TWO or MORE correct answers out of 4 options",
    };

    return `Generate ${numberOfQuestions} ${quizTypeDescriptions[quizType]} questions about "${topic}" at ${levelDescriptions[level]} level for NEET exam preparation.

CONTEXT: These questions are for NEET aspirants (medical entrance exam). Focus on conceptual understanding, application, and NCERT-based content. Include common misconceptions in wrong options.

IMPORTANT: Return ONLY valid JSON in this exact format, no markdown, no code blocks, just raw JSON:
{
  "questions": [
    {
      "question": "Question text here",
      "questionType": "${quizType}",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Detailed explanation with concept reference",
      "difficulty": "easy/medium/hard",
      "marks": 1
    }
  ]
}

REQUIREMENTS FOR NEET-STYLE QUESTIONS:
1. Questions must be based on NCERT curriculum (Biology, Physics, Chemistry, or General Science)
2. Each question should test conceptual understanding, not just factual recall
3. Incorrect options should represent common misconceptions or calculation errors
4. For MCQ: Exactly ONE correct answer
5. For Multiple Select: At least 2 correct answers, but not all 4
6. Explanations must reference relevant concepts, formulas, or principles
7. Use appropriate scientific terminology and units
8. Avoid ambiguous questions - each should have a clear, unambiguous answer
9. Include diagrams/figures description only if essential (describe in explanation)
10. Difficulty distribution:
    - Easy: NCERT direct questions
    - Medium: NCERT application or integration of concepts
    - Hard: Multi-step problems or tricky conceptual questions
11. Vary difficulty within the requested level
12. For multiple_select, use "correctAnswers": [0, 2] to indicate multiple correct answers`;
  }

  /**
   * Parse AI response to extract questions
   */
  static parseAIResponse(aiResponse, quizType) {
    try {
      let jsonStr = aiResponse;

      // Remove markdown code blocks if present
      if (jsonStr.includes("```json")) {
        jsonStr = jsonStr.split("```json")[1].split("```")[0];
      } else if (jsonStr.includes("```")) {
        jsonStr = jsonStr.split("```")[1].split("```")[0];
      }

      jsonStr = jsonStr.trim();
      const parsed = JSON.parse(jsonStr);
      const questions = parsed.questions || [];

      // Format questions with correct field names
      return questions.map((q, index) => ({
        questionNumber: index + 1,
        question: q.question,
        questionType: q.questionType || quizType,
        options: q.options || [],
        correctAnswer: q.correctAnswer !== undefined ? q.correctAnswer : null,
        correctAnswers: q.correctAnswers || [],
        explanation: q.explanation || "Explanation not provided",
        topic: q.topic || "General",
        difficulty: q.difficulty || "medium",
        marks: q.marks || 1,
      }));
    } catch (error) {
      throw new Error(`Failed to parse AI response: ${error.message}`);
    }
  }

  /**
   * Get generated quiz by ID
   */
  static async getQuizById(quizId) {
    try {
      const result = await QuizFactoryService.getQuizWithQuestions(quizId);
      if (!result?.quiz) throw new Error("Quiz not found");

      const { quiz, questions } = result;

      // Convert canonical Question docs to legacy quiz question shape expected by frontend.
      const legacyQuestions = questions.map((q, idx) => {
        const opts = Array.isArray(q.options) ? q.options : [];
        const optionTexts = opts.map((o) => o?.text?.en || "");
        const correctKey = q.correctAnswer;
        const correctIndex = opts.findIndex((o) => o?.key === correctKey);
        return {
          questionNumber: idx + 1,
          question: q.question?.en || "",
          questionType: "mcq",
          options: optionTexts,
          correctAnswer: correctIndex >= 0 ? correctIndex : 0,
          correctAnswers: [],
          explanation: q.explanation?.en || "",
          topic: quiz.topic,
          difficulty: q.difficulty || "medium",
          marks: 1,
        };
      });

      return {
        ...quiz,
        questions: legacyQuestions,
      };
    } catch (error) {
      throw new Error(`Failed to fetch quiz: ${error.message}`);
    }
  }

  /**
   * Get all quizzes for a user
   */
  static async getUserQuizzes(userId, page = 1, limit = 10) {
    try {
      const skip = (page - 1) * limit;

      console.log("[getUserQuizzes] Querying DB:", {
        userId: userId.toString(),
        page,
        limit,
        skip,
        timestamp: new Date().toISOString(),
      });

      const quizzes = await QuizMeta.find({ ownerUserId: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await QuizMeta.countDocuments({ ownerUserId: userId });

      console.log("[getUserQuizzes] Query results:", {
        userId: userId.toString(),
        quizzesFound: quizzes.length,
        totalCount: total,
        timestamp: new Date().toISOString(),
      });

      return {
        quizzes,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error("[getUserQuizzes] Database error:", {
        userId: userId.toString(),
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      throw new Error(`Failed to fetch quizzes: ${error.message}`);
    }
  }

  /**
   * Submit quiz attempt and save score
   */
  static async submitQuizAttempt(quizId, userId, answers, timeTaken) {
    try {
      // Ensure quizId is valid
      if (!quizId || quizId === "undefined") {
        throw new Error("Invalid quiz ID provided");
      }

      // Validate MongoDB ObjectId
      if (!mongoose.Types.ObjectId.isValid(quizId)) {
        throw new Error("Invalid quiz ID format");
      }

      const fetched = await this.getQuizById(quizId);
      if (!fetched) throw new Error(`Quiz with ID ${quizId} not found`);

      const questions = fetched.questions || [];
      const totalMarks = questions.length;
      let score = 0;

      const evaluatedAnswers = questions.map((q, index) => {
        const userAnswer = answers[index];
        const correctAnswer = q.correctAnswer;
        const isCorrect = userAnswer !== null && userAnswer !== undefined
          ? Number(userAnswer) === Number(correctAnswer)
          : false;
        if (isCorrect) score += 1;
        return {
          questionNumber: index + 1,
          userAnswer: userAnswer ?? null,
          correctAnswer,
          isCorrect,
          marks: isCorrect ? 1 : 0,
        };
      });

      const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;

      // Zero-based indexes of questions answered incorrectly in this attempt.
      const wrongQuestionIndexes = evaluatedAnswers
        .map((ea, index) => (!ea.isCorrect ? index : -1))
        .filter((index) => index >= 0);

      // Update aggregate stats
      const quizDoc = await QuizMeta.findById(quizId);
      if (quizDoc) {
        quizDoc.attempts = Array.isArray(quizDoc.attempts) ? quizDoc.attempts : [];
        quizDoc.attempts.push({
          userId: new mongoose.Types.ObjectId(userId),
          attemptDate: new Date(),
          score,
          totalQuestions: totalMarks,
          percentage,
          timeTaken: timeTaken || 0,
          wrongQuestionIndexes
        });
        quizDoc.totalAttempts = (quizDoc.totalAttempts || 0) + 1;
        const totalScore = quizDoc.attempts.reduce((sum, a) => sum + (a.score || 0), 0);
        quizDoc.avgScore = quizDoc.totalAttempts > 0 ? Math.round(totalScore / quizDoc.totalAttempts) : 0;
        await quizDoc.save();
      }

      return {
        quizId,
        score,
        totalMarks,
        percentage,
        timeTaken,
        evaluatedAnswers,
        message: `Quiz submitted successfully! Score: ${score}/${totalMarks} (${percentage}%)`,
      };
    } catch (error) {
      throw new Error(`Failed to submit quiz: ${error.message}`);
    }
  }

  /**
   * Delete a generated quiz
   */
  static async deleteQuiz(quizId, userId) {
    try {
      const quiz = await QuizMeta.findById(quizId);
      if (!quiz) {
        throw new Error("Quiz not found");
      }

      // Check ownership
      if (quiz.ownerUserId?.toString() !== userId.toString()) {
        throw new Error("Unauthorized: You can only delete your own quizzes");
      }

      await QuizMeta.findByIdAndDelete(quizId);
      return { success: true, message: "Quiz deleted successfully" };
    } catch (error) {
      throw new Error(`Failed to delete quiz: ${error.message}`);
    }
  }
}

module.exports = QuizGeneratorService;
