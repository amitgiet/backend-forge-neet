const PROMPT_TEMPLATES = {
    // NeuronZ Micro-Quiz Generation
    GENERATE_MICRO_QUIZZES: `
You are an expert NEET exam question generator. Generate exactly 4 micro-quizzes based on the given NCERT line.

NCERT Line: "{ncertText}"
Subject: {subject}
Class: {class}
Chapter: {chapter}

Requirements:
- Create 4 different types of questions testing different cognitive levels
- Each question should have exactly 4 options (A, B, C, D)
- Only ONE correct answer per question
- Include brief explanations
- Focus on NEET exam pattern
- Difficulty should match the concept complexity

Question Types to Generate:
1. Direct concept recall
2. Application/understanding
3. Analysis/comparison
4. Inference/conclusion

Return ONLY valid JSON in this exact format:
[
  {
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 1,
    "explanation": "Brief explanation why this is correct"
  }
]
`,

    // Mock Test Analysis
    ANALYZE_MOCK_TEST: `
Analyze this NEET mock test performance and provide detailed insights.

Student Performance:
- Total Questions: {totalQuestions}
- Correct Answers: {correctAnswers}
- Wrong Answers: {wrongAnswers}
- Unattempted: {unattempted}
- Time Taken: {timeTaken} minutes
- Subject-wise breakdown: {subjectBreakdown}

Provide analysis in JSON format:
{
  "overallScore": number,
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"],
  "recommendations": ["rec1", "rec2"],
  "timeManagement": "analysis",
  "subjectAnalysis": {
    "physics": "analysis",
    "chemistry": "analysis", 
    "biology": "analysis"
  }
}
`,

    // Study Plan Generation
    GENERATE_STUDY_PLAN: `
Create a personalized NEET study plan based on student profile and weaknesses.

Student Profile:
- Current Class: {currentClass}
- Target Exam Date: {examDate}
- Weak Subjects: {weakSubjects}
- Strong Subjects: {strongSubjects}
- Daily Study Hours: {studyHours}
- Coaching: {coaching}

Generate a structured study plan in JSON format:
{
  "weeklyPlan": [
    {
      "week": 1,
      "subjects": {
        "physics": ["topic1", "topic2"],
        "chemistry": ["topic1", "topic2"],
        "biology": ["topic1", "topic2"]
      },
      "mockTests": 1,
      "revisionHours": 2
    }
  ],
  "dailySchedule": {
    "morning": "activity",
    "afternoon": "activity", 
    "evening": "activity"
  },
  "milestones": ["milestone1", "milestone2"]
}
`,

    // Weakness Analysis
    ANALYZE_WEAKNESS: `
Analyze student's performance pattern and identify specific weaknesses.

Performance Data:
- Chapter: {chapterName}
- Subject: {subject}
- Questions Attempted: {attempted}
- Accuracy: {accuracy}%
- Common Wrong Answers: {wrongPatterns}
- Time per Question: {avgTime} seconds

Provide detailed weakness analysis:
{
  "weaknessType": "conceptual|procedural|careless",
  "specificAreas": ["area1", "area2"],
  "rootCause": "explanation",
  "remedyPlan": {
    "immediateActions": ["action1", "action2"],
    "practiceQuestions": number,
    "revisionTopics": ["topic1", "topic2"],
    "timeframe": "duration"
  },
  "confidenceLevel": "low|medium|high"
}
`,

    // Question Explanation
    EXPLAIN_QUESTION: `
Provide a detailed explanation for this NEET question.

Question: {question}
Options: {options}
Correct Answer: {correctAnswer}
Student's Answer: {studentAnswer}
Subject: {subject}
Topic: {topic}

Provide explanation in JSON format:
{
  "correctExplanation": "Why the correct answer is right",
  "wrongOptionAnalysis": {
    "A": "Why this is wrong",
    "B": "Why this is wrong", 
    "C": "Why this is wrong",
    "D": "Why this is wrong"
  },
  "conceptsInvolved": ["concept1", "concept2"],
  "relatedTopics": ["topic1", "topic2"],
  "memoryTips": ["tip1", "tip2"],
  "commonMistakes": ["mistake1", "mistake2"]
}
`,

    // NCERT Line Context Enhancement
    ENHANCE_NCERT_CONTEXT: `
Enhance the context around this NCERT line for better quiz generation.

NCERT Line: "{ncertText}"
Subject: {subject}
Class: {class}
Chapter: {chapter}
Page: {page}

Provide enhanced context:
{
  "mainConcept": "primary concept being discussed",
  "relatedConcepts": ["concept1", "concept2"],
  "prerequisites": ["prereq1", "prereq2"],
  "applications": ["app1", "app2"],
  "commonMisconceptions": ["misconception1", "misconception2"],
  "examImportance": "high|medium|low",
  "difficulty": "easy|medium|hard",
  "keyTerms": ["term1", "term2"]
}
`
};

module.exports = PROMPT_TEMPLATES;