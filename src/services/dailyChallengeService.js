const mongoose = require('mongoose');
const GeminiService = require('./geminiService');
const DailyChallenge = require('../models/DailyChallenge');
const GeneratedQuiz = require('../models/GeneratedQuiz');
const User = require('../models/User');

class DailyChallengeService {
  static SUBJECTS = ['Physics', 'Chemistry', 'Biology', 'Mathematics'];
  static DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

  /**
   * Generate today's daily challenge with questions using AI
   */
  static async generateTodaysChallenge() {
    try {
      console.log('[DailyChallengeService] Generating today\'s challenge...');

      // Check if today's challenge already exists
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const existing = await DailyChallenge.findOne({ date: today, isActive: true }).populate('quizId');
      if (existing && existing.quizId) {
        console.log('[DailyChallengeService] Today\'s challenge already exists');
        return existing;
      }

      // Select random subject and generate topic
      const subject = this.SUBJECTS[Math.floor(Math.random() * this.SUBJECTS.length)];
      const difficulty = this.DIFFICULTIES[1]; // Medium difficulty
      
      let topic = subject + ' - Daily Challenge';
      
      try {
        topic = await this.generateTopic(subject);
        console.log(`[DailyChallengeService] Generated topic: ${topic} (${subject})`);
      } catch (topicError) {
        console.warn('[DailyChallengeService] Topic generation failed, using default:', topicError.message);
        // Continue with default topic
      }

      // Generate 5 MCQ questions via GeneratedQuiz
      let generatedQuiz;
      try {
        generatedQuiz = await this.generateQuiz(topic, subject, difficulty);
        console.log(`[DailyChallengeService] Generated quiz with ${generatedQuiz.questions.length} questions`);
      } catch (quizError) {
        console.warn('[DailyChallengeService] Quiz generation failed, using fallback:', quizError.message);
        // Create quiz with fallback questions
        generatedQuiz = await this.createFallbackQuiz(topic, subject, difficulty);
      }

      // Create or update challenge
      let challenge = existing || new DailyChallenge({
        date: today,
        subject: subject.toLowerCase(),
        difficulty: difficulty.toLowerCase(),
        icon: this.getIconForSubject(subject)
      });

      challenge.topic = topic;
      challenge.quizId = generatedQuiz._id;
      challenge.xpReward = difficulty === 'Easy' ? 100 : difficulty === 'Medium' ? 150 : 200;
      challenge.timeLimit = difficulty === 'Easy' ? 8 : difficulty === 'Medium' ? 10 : 12;

      // Generate reading content for the topic
      try {
        const content = await this.generateContent(topic, subject);
        challenge.content = content;
        console.log('[DailyChallengeService] Generated content successfully');
      } catch (contentError) {
        console.warn('[DailyChallengeService] Content generation failed:', contentError.message);
        // Continue with empty content - not critical
      }

      await challenge.save();
      console.log('[DailyChallengeService] Challenge saved successfully');

      return challenge;
    } catch (error) {
      console.error('[DailyChallengeService] Error generating challenge:', error);
      // Return emergency fallback challenge
      return this.getEmergencyChallenge();
    }
  }

  /**
   * Generate a topic for the daily challenge using AI
   */
  static async generateTopic(subject) {
    try {
      const prompt = `Generate ONE interesting NCERT topic from ${subject} for a daily challenge. 
      The topic should be:
      - Specific and focused (e.g., "Photosynthesis - Light Dependent Reactions" not just "Biology")
      - At JEE/NEET level
      - Interesting for student engagement
      
      Return ONLY the topic name, nothing else. Max 8 words.`;

      const topic = await GeminiService.generateText(prompt);
      return topic.trim();
    } catch (error) {
      console.error('[DailyChallengeService] Error generating topic:', error);
      // Fallback topics
      const fallbackTopics = {
        Physics: 'Electromagnetic Induction',
        Chemistry: 'Organic Reaction Mechanisms',
        Biology: 'Cellular Respiration',
        Mathematics: 'Definite Integrals'
      };
      return fallbackTopics[subject] || 'General Concepts';
    }
  }

  /**
   * Generate reading material content for the topic
   */
  static async generateContent(topic, subject) {
    try {
      const prompt = `Create detailed study material for the topic "${topic}" in ${subject}.

Format the content with:
- ## Main Section headings
- ### Subsection headings  
- **Bold** for important terms
- Regular paragraphs for explanations
- Bullet points (- ) for key points
- Keep it concise but comprehensive (200-300 words)
- Use Markdown formatting

Make it suitable for JEE/NEET level exam preparation.`;

      const content = await GeminiService.generateText(prompt);
      return content.trim();
    } catch (error) {
      console.error('[DailyChallengeService] Error generating content:', error);
      // Return default content if generation fails
      return `## ${topic}\n\nStudy material for this topic. Read carefully before attempting the quiz.`;
    }
  }

  /**
   * Generate 5 MCQ questions for the topic using AI and store in GeneratedQuiz
   */
  static async generateQuiz(topic, subject, difficulty) {
    try {
      const prompt = `Generate 5 multiple-choice questions for the topic "${topic}" in ${subject}.
      Difficulty: ${difficulty}
      
      For each question, provide JSON in this exact format:
      {
        "question": "Question text here?",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctAnswer": 1,
        "explanation": "Brief explanation of why this is correct"
      }
      
      Return ONLY a JSON array with 5 objects. NO other text.
      Ensure:
      - Questions are clear and unambiguous
      - Options are plausible distractors
      - Correct answer index is 0-3
      - Explanations are educational
      - Questions test conceptual understanding`;

      const response = await GeminiService.generateText(prompt);
      
      // Parse JSON response
      let questionsData;
      try {
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          questionsData = JSON.parse(jsonMatch[0]);
        } else {
          questionsData = JSON.parse(response);
        }
      } catch (parseError) {
        console.error('[DailyChallengeService] JSON parse error:', parseError);
        console.log('[DailyChallengeService] Raw response:', response);
        // Use fallback questions if parsing fails
        questionsData = this.getFallbackQuestions(topic, subject);
      }

      // Validate questions
      if (!Array.isArray(questionsData) || questionsData.length < 5) {
        throw new Error(`Expected 5 questions, got ${questionsData.length}`);
      }

      // Format questions for GeneratedQuiz
      const formattedQuestions = questionsData.slice(0, 5).map((q, index) => {
        if (!q.question || !q.options || q.options.length !== 4 || typeof q.correctAnswer !== 'number') {
          console.warn(`[DailyChallengeService] Question ${index} invalid, using fallback`);
          const fallback = this.getFallbackQuestion(topic, subject, index);
          return {
            questionNumber: index + 1,
            question: fallback.question,
            questionType: 'mcq',
            options: fallback.options,
            correctAnswer: fallback.correct,
            explanation: fallback.explanation,
            topic: topic,
            difficulty: difficulty.toLowerCase(),
            marks: 1
          };
        }
        return {
          questionNumber: index + 1,
          question: q.question,
          questionType: 'mcq',
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation || 'Review the topic to understand the concept better.',
          topic: topic,
          difficulty: difficulty.toLowerCase(),
          marks: 1
        };
      });

      // Create GeneratedQuiz document with dummy userId for daily challenge
      // In real scenario, we might create it without userId or use an admin user
      const systemUser = await User.findOne({ email: 'system@neetforge.com' });
      const userId = systemUser?._id || new mongoose.Types.ObjectId();

      const generatedQuiz = new GeneratedQuiz({
        userId,
        topic,
        subject: subject.toLowerCase(),
        level: 1, // Daily challenge is level 1
        quizType: 'mcq',
        questions: formattedQuestions,
        totalQuestions: formattedQuestions.length,
        totalMarks: formattedQuestions.length,
        timeLimit: difficulty === 'Easy' ? 8 : difficulty === 'Medium' ? 10 : 12
      });

      await generatedQuiz.save();
      console.log(`[DailyChallengeService] GeneratedQuiz created: ${generatedQuiz._id}`);

      return generatedQuiz;
    } catch (error) {
      console.error('[DailyChallengeService] Error generating quiz:', error);
      throw error;
    }
  }

  /**
   * Get fallback questions if AI generation fails
   */
  static getFallbackQuestions(topic, subject) {
    const fallbackSets = {
      Physics: [
        {
          question: 'What is the SI unit of force?',
          options: ['Newton', 'Joule', 'Pascal', 'Watt'],
          correct: 0,
          explanation: 'Force is measured in Newtons (N) in the SI system.'
        },
        {
          question: 'Which law states that every action has an equal and opposite reaction?',
          options: ['First Law', 'Second Law', 'Third Law', 'Fourth Law'],
          correct: 2,
          explanation: 'Newton\'s Third Law of Motion states action-reaction pairs.'
        },
        {
          question: 'What is the relationship between power, energy, and time?',
          options: ['P = E + T', 'P = E / T', 'P = E × T', 'P = T / E'],
          correct: 1,
          explanation: 'Power is defined as energy per unit time: P = E/T'
        },
        {
          question: 'What is the speed of light in vacuum?',
          options: ['3 × 10^8 m/s', '3 × 10^5 m/s', '3 × 10^10 m/s', '3 × 10^6 m/s'],
          correct: 0,
          explanation: 'The speed of light is approximately 3 × 10^8 meters per second.'
        },
        {
          question: 'What is gravitational potential energy?',
          options: ['mgh', 'mv²/2', 'kx²/2', 'GMm/r'],
          correct: 0,
          explanation: 'Gravitational PE near Earth\'s surface is mgh, where h is height above reference.'
        }
      ],
      Chemistry: [
        {
          question: 'What is the atomic number of Oxygen?',
          options: ['6', '8', '10', '16'],
          correct: 1,
          explanation: 'Oxygen has 8 protons, so atomic number is 8.'
        },
        {
          question: 'What type of bond is present in CO₂?',
          options: ['Ionic', 'Covalent', 'Metallic', 'Hydrogen'],
          correct: 1,
          explanation: 'CO₂ has covalent bonds between carbon and oxygen atoms.'
        },
        {
          question: 'What is the pH of pure water at 25°C?',
          options: ['6', '7', '8', '10'],
          correct: 1,
          explanation: 'Pure water at 25°C has pH = 7 (neutral).'
        },
        {
          question: 'Which element has the highest electronegativity?',
          options: ['Oxygen', 'Nitrogen', 'Fluorine', 'Chlorine'],
          correct: 2,
          explanation: 'Fluorine is the most electronegative element on the periodic table.'
        },
        {
          question: 'What is Avogadro\'s number?',
          options: ['6.02 × 10^22', '6.02 × 10^23', '6.02 × 10^24', '6.02 × 10^21'],
          correct: 1,
          explanation: 'Avogadro\'s number is 6.02 × 10^23 particles/mol.'
        }
      ],
      Biology: [
        {
          question: 'What is the powerhouse of the cell?',
          options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi Body'],
          correct: 1,
          explanation: 'Mitochondria is the powerhouse, producing ATP energy.'
        },
        {
          question: 'How many chromosomes do humans have?',
          options: ['23', '46', '92', '48'],
          correct: 1,
          explanation: 'Humans have 46 chromosomes (23 pairs).'
        },
        {
          question: 'What is the function of chloroplasts?',
          options: ['Digestion', 'Photosynthesis', 'Movement', 'Storage'],
          correct: 1,
          explanation: 'Chloroplasts are the site of photosynthesis in plant cells.'
        },
        {
          question: 'Which enzyme breaks down starch?',
          options: ['Lipase', 'Protease', 'Amylase', 'Lactase'],
          correct: 2,
          explanation: 'Amylase breaks down starch into sugars.'
        },
        {
          question: 'What is the basic unit of life?',
          options: ['Atom', 'Molecule', 'Cell', 'Tissue'],
          correct: 2,
          explanation: 'The cell is the basic unit of all living organisms.'
        }
      ],
      Mathematics: [
        {
          question: 'What is the derivative of x²?',
          options: ['x', '2x', 'x³', '2'],
          correct: 1,
          explanation: 'Using power rule: d/dx(x²) = 2x'
        },
        {
          question: 'What is the value of sin(π/2)?',
          options: ['0', '1', '-1', '√2/2'],
          correct: 1,
          explanation: 'sin(π/2) = 1'
        },
        {
          question: 'What is the sum of angles in a triangle?',
          options: ['90°', '180°', '270°', '360°'],
          correct: 1,
          explanation: 'The sum of angles in a triangle is always 180°.'
        },
        {
          question: 'What is the solution to x² = 16?',
          options: ['4', '±4', '8', '2'],
          correct: 1,
          explanation: 'x² = 16 has solutions x = 4 and x = -4'
        },
        {
          question: 'What is the integral of x?',
          options: ['1', 'x²/2 + C', '2x + C', 'x + C'],
          correct: 1,
          explanation: 'Using power rule: ∫x dx = x²/2 + C'
        }
      ]
    };

    return fallbackSets[subject] || fallbackSets.Physics;
  }

  /**
   * Get a single fallback question
   */
  static getFallbackQuestion(topic, subject, index) {
    const fallbacks = this.getFallbackQuestions(topic, subject);
    return fallbacks[index % fallbacks.length];
  }

  /**
   * Get emoji icon for subject
   */
  static getIconForSubject(subject) {
    const icons = {
      Physics: '⚛️',
      Chemistry: '🔬',
      Biology: '🧬',
      Mathematics: '📐'
    };
    return icons[subject] || '📚';
  }

  /**
   * Submit daily challenge answer and calculate score
   */
  static async submitChallenge(userId, username, answers, challengeId) {
    try {
      console.log(`[DailyChallengeService] Submitting challenge for user ${userId}`);

      const challenge = await DailyChallenge.findById(challengeId).populate('quizId');
      if (!challenge) {
        throw new Error('Challenge not found');
      }

      if (!challenge.quizId) {
        throw new Error('Quiz not found for this challenge');
      }

      const quiz = challenge.quizId;
      const questions = quiz.questions;

      // Calculate score
      let correctCount = 0;
      const detailedAnswers = answers.map((answer, index) => {
        const isCorrect = answer === questions[index].correctAnswer;
        if (isCorrect) correctCount++;
        return {
          questionIndex: index,
          userAnswer: answer,
          correctAnswer: questions[index].correctAnswer,
          isCorrect,
          explanation: questions[index].explanation,
          question: questions[index].question,
          options: questions[index].options
        };
      });

      const score = Math.round((correctCount / questions.length) * 100);
      
      // Calculate XP based on score
      const xpEarned = score >= 80 
        ? challenge.xpReward 
        : score >= 60 
          ? Math.round(challenge.xpReward * 0.75)
          : Math.round(challenge.xpReward * 0.5);

      // Record completion
      const alreadyCompleted = challenge.completedBy.find(c => c.userId.toString() === userId);
      if (!alreadyCompleted) {
        challenge.completedBy.push({
          userId,
          score,
          xpEarned,
          answers: answers // Store user's answers
        });
        await challenge.save();
      }

      console.log(`[DailyChallengeService] Challenge completed: Score=${score}, XP=${xpEarned}`);

      return {
        score,
        correctCount,
        totalQuestions: questions.length,
        xpEarned,
        detailedAnswers,
        challenge: {
          id: challenge._id,
          topic: challenge.topic,
          subject: challenge.subject
        }
      };
    } catch (error) {
      console.error('[DailyChallengeService] Error submitting challenge:', error);
      throw error;
    }
  }

  /**
   * Create a quiz with fallback questions when AI generation fails
   */
  static async createFallbackQuiz(topic, subject, difficulty) {
    try {
      const systemUser = await User.findOne({ email: 'system@neetforge.com' });
      const userId = systemUser?._id || new mongoose.Types.ObjectId();

      const fallbackQuestions = this.getFallbackQuestions(topic, subject);

      const generatedQuiz = new GeneratedQuiz({
        userId,
        topic,
        subject: subject.toLowerCase(),
        level: 1,
        quizType: 'mcq',
        questions: fallbackQuestions.map((q, i) => ({
          questionNumber: i + 1,
          question: q.question,
          questionType: 'mcq',
          options: q.options,
          correctAnswer: q.correct,
          explanation: q.explanation,
          topic: topic,
          difficulty: difficulty.toLowerCase(),
          marks: 1
        })),
        totalQuestions: fallbackQuestions.length,
        totalMarks: fallbackQuestions.length
      });

      await generatedQuiz.save();
      console.log('[DailyChallengeService] Fallback quiz created:', generatedQuiz._id);
      return generatedQuiz;
    } catch (error) {
      console.error('[DailyChallengeService] Error creating fallback quiz:', error);
      throw error;
    }
  }

  /**
   * Emergency challenge - absolute last resort if everything fails
   */
  static async getEmergencyChallenge() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Check if emergency challenge already exists
      let challenge = await DailyChallenge.findOne({ date: today }).populate('quizId');
      if (challenge && challenge.quizId) {
        return challenge;
      }

      // Create emergency challenge
      const fallbackQuestions = this.getFallbackQuestions('General Science', 'Physics');
      
      const systemUser = await User.findOne({ email: 'system@neetforge.com' });
      const userId = systemUser?._id || new mongoose.Types.ObjectId();

      const quiz = new GeneratedQuiz({
        userId,
        topic: 'General Science - Emergency Challenge',
        subject: 'physics',
        level: 1,
        quizType: 'mcq',
        questions: fallbackQuestions.map((q, i) => ({
          questionNumber: i + 1,
          question: q.question,
          questionType: 'mcq',
          options: q.options,
          correctAnswer: q.correct,
          explanation: q.explanation,
          topic: 'General Science',
          difficulty: 'medium',
          marks: 1
        }))
      });

      await quiz.save();

      challenge = new DailyChallenge({
        date: today,
        topic: 'General Science - Emergency Challenge',
        subject: 'physics',
        difficulty: 'medium',
        icon: '⚛️',
        xpReward: 150,
        timeLimit: 10,
        content: `## General Science - Emergency Challenge\n\n### Physics Fundamentals\n\nThis is a basic science quiz covering fundamental concepts in physics.\n\n**Key Topics:**\n- Basic mechanics and motion\n- Energy and work\n- Forces and Newton's laws\n- Simple harmonic motion\n\n**Instructions:**\n1. Read each question carefully\n2. Select the most appropriate answer\n3. Time limit: 10 minutes\n4. Good luck!`,
        quizId: quiz._id
      });

      await challenge.save();
      console.log('[DailyChallengeService] Emergency challenge created');
      return challenge;
    } catch (error) {
      console.error('[DailyChallengeService] Emergency challenge failed:', error);
      // Return a basic object even if DB fails
      return {
        _id: 'emergency',
        topic: 'General Science Quiz',
        subject: 'physics',
        difficulty: 'medium',
        xpReward: 150,
        timeLimit: 10,
        quizId: { questions: this.getFallbackQuestions('General Science', 'Physics') }
      };
    }
  }
}

module.exports = DailyChallengeService;
