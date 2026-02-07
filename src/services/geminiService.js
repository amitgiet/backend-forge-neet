const { GoogleGenerativeAI } = require('@google/generative-ai');
const PROMPT_TEMPLATES = require('../config/promptTemplates');

class GeminiService {
    constructor() {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is required in environment variables');
        }
        
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    }

    /**
     * Generate micro-quizzes for NCERT line
     */
    async generateMicroQuizzes(ncertLine) {
        try {
            const prompt = this.formatPrompt(PROMPT_TEMPLATES.GENERATE_MICRO_QUIZZES, {
                ncertText: ncertLine.ncertText,
                subject: ncertLine.subject,
                class: ncertLine.class,
                chapter: ncertLine.chapter
            });

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            
            // Parse JSON response
            const quizzes = this.parseJSONResponse(text);
            
            if (!Array.isArray(quizzes) || quizzes.length !== 4) {
                throw new Error('Invalid quiz format received from AI');
            }

            return quizzes;
            
        } catch (error) {
            console.error('Error generating micro-quizzes:', error);
            throw new Error('Failed to generate micro-quizzes');
        }
    }

    /**
     * Analyze mock test performance
     */
    async analyzeMockTest(performanceData) {
        try {
            const prompt = this.formatPrompt(PROMPT_TEMPLATES.ANALYZE_MOCK_TEST, performanceData);
            
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            
            return this.parseJSONResponse(text);
            
        } catch (error) {
            console.error('Error analyzing mock test:', error);
            throw new Error('Failed to analyze mock test');
        }
    }

    /**
     * Generate personalized study plan
     */
    async generateStudyPlan(studentProfile) {
        try {
            const prompt = this.formatPrompt(PROMPT_TEMPLATES.GENERATE_STUDY_PLAN, studentProfile);
            
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            
            return this.parseJSONResponse(text);
            
        } catch (error) {
            console.error('Error generating study plan:', error);
            throw new Error('Failed to generate study plan');
        }
    }

    /**
     * Analyze student weaknesses
     */
    async analyzeWeakness(performanceData) {
        try {
            const prompt = this.formatPrompt(PROMPT_TEMPLATES.ANALYZE_WEAKNESS, performanceData);
            
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            
            return this.parseJSONResponse(text);
            
        } catch (error) {
            console.error('Error analyzing weakness:', error);
            throw new Error('Failed to analyze weakness');
        }
    }

    /**
     * Generate quiz questions for a given topic
     */
    async generateQuiz(quizData) {
        try {
            const { prompt } = quizData;
            
            console.log('Generating quiz with prompt length:', prompt.length);
            
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            
            console.log('Gemini response received, length:', text.length);
            
            return text;
            
        } catch (error) {
            console.error('Gemini API Error:', error.message);
            console.error('Full error:', error);
            throw new Error(`Gemini API Error: ${error.message}`);
        }
    }

    /**
     * Explain question with detailed analysis
     */
    async explainQuestion(questionData) {
        try {
            const prompt = this.formatPrompt(PROMPT_TEMPLATES.EXPLAIN_QUESTION, questionData);
            
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            
            return this.parseJSONResponse(text);
            
        } catch (error) {
            console.error('Error explaining question:', error);
            throw new Error('Failed to explain question');
        }
    }

    /**
     * Enhance NCERT line context
     */
    async enhanceNCERTContext(ncertLine) {
        try {
            const prompt = this.formatPrompt(PROMPT_TEMPLATES.ENHANCE_NCERT_CONTEXT, ncertLine);
            
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            
            return this.parseJSONResponse(text);
            
        } catch (error) {
            console.error('Error enhancing NCERT context:', error);
            throw new Error('Failed to enhance NCERT context');
        }
    }

    /**
     * Format prompt template with variables
     */
    formatPrompt(template, variables) {
        let formattedPrompt = template;
        
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = `{${key}}`;
            formattedPrompt = formattedPrompt.replace(new RegExp(placeholder, 'g'), value);
        }
        
        return formattedPrompt;
    }

    /**
     * Parse JSON response from AI, handling potential formatting issues
     */
    parseJSONResponse(text) {
        try {
            // Remove markdown code blocks if present
            const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            return JSON.parse(cleanText);
            
        } catch (error) {
            console.error('Failed to parse AI response as JSON:', text);
            throw new Error('Invalid JSON response from AI');
        }
    }

    /**
     * Generate content with retry mechanism
     */
    async generateWithRetry(prompt, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                return response.text();
                
            } catch (error) {
                console.error(`Attempt ${attempt} failed:`, error);
                
                if (attempt === maxRetries) {
                    throw error;
                }
                
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
    }
}

module.exports = GeminiService;