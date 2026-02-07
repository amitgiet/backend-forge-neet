const GeminiService = require("./geminiService");
const GeneratedQuiz = require("../models/GeneratedQuiz");
const mongoose = require("mongoose");

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
      const geminiService = new GeminiService();

      // Step 1: Generate question texts/types only
      const questionTextPrompt = `Generate ${numberOfQuestions} NEET exam-style ${quizType} questions about "${topic}" at difficulty level ${level}.

Context: These are for NEET aspirants (medical entrance exam). Focus on NCERT-based content from Physics, Chemistry, or Biology.

Return ONLY valid JSON, no markdown, no explanation, no extra text. The response must start with { and end with }. Format:
{
  "questions": [
    {
      "question": "Question text here",
      "questionType": "${quizType}"
    }
  ]
}

Requirements:
- Each question should test conceptual understanding
- Questions should be based on NCERT curriculum
- Include questions that test application and analysis
- Vary the difficulty within the specified level`;
      const aiQuestionsResponse = await geminiService.generateQuiz({
        prompt: questionTextPrompt,
      });
      let parsedQuestions;
      try {
        parsedQuestions = JSON.parse(aiQuestionsResponse.trim()).questions;
      } catch (e) {
        // Fallback: try to extract first {...} block
        console.error(
          "Failed to parse question texts from AI. Raw response:",
          aiQuestionsResponse,
        );
        const match = aiQuestionsResponse.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsedQuestions = JSON.parse(match[0]).questions;
          } catch (e2) {
            throw new Error(
              "Failed to parse question texts from AI (even after extraction)",
            );
          }
        } else {
          throw new Error(
            "Failed to parse question texts from AI (no JSON found)",
          );
        }
      }

      // Step 2: For each question, generate options/answers in parallel
      const questionDetails = await Promise.all(
        parsedQuestions.map(async (q, idx) => {
          let detailPrompt = "";

          if (q.questionType === "multiple_select") {
            detailPrompt = `For NEET exam preparation, complete this multiple select question. Provide ONLY valid JSON with exactly 4 plausible options, correctAnswers as an array of indices (2-3 correct answers), a detailed explanation with concept reference, difficulty (easy/medium/hard), and marks (default 1):

Question: "${q.question}"

Requirements for NEET:
- All 4 options should be scientifically plausible
- 2-3 options are correct (not all 4, not just 1)
- Wrong options represent common misconceptions
- Explanation should reference relevant NCERT concepts, formulas, or principles
- Format exactly as:
{
  "question": "${q.question}",
  "questionType": "multiple_select",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctAnswers": [0, 2],
  "explanation": "Detailed explanation with concept references",
  "difficulty": "medium",
  "marks": 1
}`;
          } else {
            // MCQ (default)
            detailPrompt = `For NEET exam preparation, complete this MCQ question. Provide ONLY valid JSON with exactly 4 plausible options, correctAnswer as the index (0-3), a detailed explanation with concept reference, difficulty (easy/medium/hard), and marks (default 1):

Question: "${q.question}"

Requirements for NEET:
- Exactly ONE correct answer
- All 4 options should be scientifically plausible
- Wrong options should represent common errors, misconceptions, or calculation mistakes
- Explanation should reference relevant NCERT concepts, formulas, or principles
- Include why other options are incorrect if helpful
- Format exactly as:
{
  "question": "${q.question}",
  "questionType": "mcq",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctAnswer": 0,
  "explanation": "Detailed explanation with concept references and why others are wrong",
  "difficulty": "medium",
  "marks": 1
}`;
          }

          const aiDetailResponse = await geminiService.generateQuiz({
            prompt: detailPrompt,
          });
          let detailObj;
          try {
            detailObj = JSON.parse(aiDetailResponse.trim());
          } catch (e) {
            // fallback: return minimal question
            detailObj = {
              question: q.question,
              questionType: q.questionType,
              options: [],
              correctAnswer: null,
              correctAnswers: [],
              explanation: "AI failed to parse",
              difficulty: "medium",
              marks: 1,
            };
          }

          // Robustness: ensure all required fields
          if (
            !Array.isArray(detailObj.options) ||
            detailObj.options.length !== 4
          ) {
            detailObj.options = [
              "Option A",
              "Option B",
              "Option C",
              "Option D",
            ];
          }

          // Ensure correct answer/answers are set
          if (detailObj.questionType === "multiple_select") {
            if (
              !Array.isArray(detailObj.correctAnswers) ||
              detailObj.correctAnswers.length === 0
            ) {
              detailObj.correctAnswers = [0, 2]; // Default: options A and C
            }
          } else {
            if (
              typeof detailObj.correctAnswer !== "number" ||
              detailObj.correctAnswer < 0 ||
              detailObj.correctAnswer > 3
            ) {
              detailObj.correctAnswer = 0; // Default: option A
            }
          }

          return {
            questionNumber: idx + 1,
            question: detailObj.question,
            questionType: detailObj.questionType || "mcq",
            options: detailObj.options || [],
            correctAnswer:
              detailObj.correctAnswer !== undefined
                ? detailObj.correctAnswer
                : null,
            correctAnswers: detailObj.correctAnswers || [],
            explanation: detailObj.explanation || "Explanation not provided",
            topic: topic,
            difficulty: detailObj.difficulty || "medium",
            marks: detailObj.marks || 1,
          };
        }),
      );

      // Create the GeneratedQuiz document
      const generatedQuiz = new GeneratedQuiz({
        userId,
        topic,
        subject: "general",
        level,
        quizType,
        questions: questionDetails,
        totalQuestions: questionDetails.length,
        aiModel: "gemini-2.5-flash-lite",
        tags: [topic.toLowerCase()],
        isPublished: true,
      });

      // Save to database and wait for it (ensures ID is valid)
      const savedQuiz = await generatedQuiz.save();

      console.log("[QuizGenerator] Quiz saved to DB successfully:", {
        quizId: savedQuiz._id.toString(),
        userId: savedQuiz.userId,
        topic: savedQuiz.topic,
        totalQuestions: savedQuiz.totalQuestions,
        timestamp: new Date().toISOString(),
      });

      // Return quiz data to frontend with confirmed DB-persisted ID
      return {
        success: true,
        _id: savedQuiz._id.toString(), // Return as string ID
        quizId: savedQuiz._id.toString(), // Also include as quizId for compatibility
        topic: savedQuiz.topic,
        level: savedQuiz.level,
        totalQuestions: savedQuiz.totalQuestions,
        totalMarks: savedQuiz.totalMarks,
        duration: savedQuiz.duration,
        questions: savedQuiz.questions,
        message: `Quiz generated successfully with ${questionDetails.length} questions`,
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
      const quiz = await GeneratedQuiz.findById(quizId);
      if (!quiz) {
        throw new Error("Quiz not found");
      }
      return quiz;
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

      const quizzes = await GeneratedQuiz.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await GeneratedQuiz.countDocuments({ userId });

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

      const quiz = await GeneratedQuiz.findById(quizId);
      if (!quiz) {
        throw new Error(`Quiz with ID ${quizId} not found`);
      }

      // Calculate score
      let score = 0;
      const evaluatedAnswers = quiz.questions.map((q, index) => {
        const userAnswer = answers[index];
        let isCorrect = false;

        // Handle null/undefined answers (unanswered questions)
        if (userAnswer === null || userAnswer === undefined) {
          return {
            questionNumber: index + 1,
            userAnswer: null,
            correctAnswer: q.correctAnswer || q.correctAnswers,
            isCorrect: false,
            marks: 0,
          };
        }

        if (q.questionType === "multiple_select") {
          // Multiple correct answers - compare arrays
          isCorrect =
            Array.isArray(userAnswer) &&
            Array.isArray(q.correctAnswers) &&
            JSON.stringify(userAnswer.sort()) ===
              JSON.stringify(q.correctAnswers.sort());
        } else {
          // MCQ - single answer
          isCorrect = Number(userAnswer) === Number(q.correctAnswer);
        }

        if (isCorrect) {
          score += q.marks || 1;
        }

        return {
          questionNumber: index + 1,
          userAnswer,
          correctAnswer: q.correctAnswer || q.correctAnswers,
          isCorrect,
          marks: isCorrect ? q.marks || 1 : 0,
        };
      });

      const percentage = Math.round((score / quiz.totalMarks) * 100);

      // Save attempt
      quiz.attempts.push({
        userId: new mongoose.Types.ObjectId(userId),
        attemptDate: new Date(),
        score,
        percentage,
        timeTaken,
        answers,
      });

      quiz.totalAttempts += 1;

      // Update average score
      const totalScore = quiz.attempts.reduce((sum, a) => sum + a.score, 0);
      quiz.avgScore = Math.round(totalScore / quiz.totalAttempts);

      await quiz.save();

      return {
        quizId,
        score,
        totalMarks: quiz.totalMarks,
        percentage,
        timeTaken,
        evaluatedAnswers,
        message: `Quiz submitted successfully! Score: ${score}/${quiz.totalMarks} (${percentage}%)`,
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
      const quiz = await GeneratedQuiz.findById(quizId);
      if (!quiz) {
        throw new Error("Quiz not found");
      }

      // Check ownership
      if (quiz.userId.toString() !== userId.toString()) {
        throw new Error("Unauthorized: You can only delete your own quizzes");
      }

      await GeneratedQuiz.findByIdAndDelete(quizId);
      return { success: true, message: "Quiz deleted successfully" };
    } catch (error) {
      throw new Error(`Failed to delete quiz: ${error.message}`);
    }
  }
}

module.exports = QuizGeneratorService;
