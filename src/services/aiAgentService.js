const { GoogleGenerativeAI } = require('@google/generative-ai');
const AITools = require('./aiTools');
const AIAnalysisService = require('./aiAnalysisService');

class AIAgentService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({
            model: 'gemini-2.5-flash-lite',
            tools: [{
                functionDeclarations: this.getFunctionDeclarations()
            }]
        });
    }

    getFunctionDeclarations() {
        return [
            {
                name: 'getLastQuiz',
                description: 'Get user\'s recent quiz attempts with scores and topics',
                parameters: {
                    type: 'object',
                    properties: {
                        limit: { type: 'number', description: 'Number of quizzes to retrieve (default 5)' }
                    }
                }
            },
            {
                name: 'getLastTest',
                description: 'Get user\'s recent test attempts with detailed results',
                parameters: {
                    type: 'object',
                    properties: {
                        limit: { type: 'number', description: 'Number of tests to retrieve (default 3)' }
                    }
                }
            },
            {
                name: 'getOverallAccuracy',
                description: 'Get user\'s overall performance statistics and accuracy',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'getSubjectAccuracy',
                description: 'Get accuracy for a specific subject (physics, chemistry, biology)',
                parameters: {
                    type: 'object',
                    properties: {
                        subject: { type: 'string', description: 'Subject name: physics, chemistry, or biology' }
                    },
                    required: ['subject']
                }
            },
            {
                name: 'getChapterAccuracy',
                description: 'Get accuracy for a specific chapter in a subject',
                parameters: {
                    type: 'object',
                    properties: {
                        subject: { type: 'string', description: 'Subject name' },
                        chapter: { type: 'string', description: 'Chapter ID or name' }
                    },
                    required: ['subject', 'chapter']
                }
            },
            {
                name: 'getAccuracyTrend',
                description: 'Get accuracy trend over time',
                parameters: {
                    type: 'object',
                    properties: {
                        days: { type: 'number', description: 'Number of days to analyze (default 7)' }
                    }
                }
            },
            {
                name: 'getWeakTopics',
                description: 'Identify user\'s weak topics that need improvement',
                parameters: {
                    type: 'object',
                    properties: {
                        limit: { type: 'number', description: 'Number of weak topics to retrieve (default 5)' }
                    }
                }
            },
            {
                name: 'getWeakChapters',
                description: 'Get weak chapters for a subject or all subjects',
                parameters: {
                    type: 'object',
                    properties: {
                        subject: { type: 'string', description: 'Optional subject filter' }
                    }
                }
            },
            {
                name: 'getRecentlyWrong',
                description: 'Get questions user answered incorrectly recently',
                parameters: {
                    type: 'object',
                    properties: {
                        limit: { type: 'number', description: 'Number of questions (default 10)' }
                    }
                }
            },
            {
                name: 'getRevisionDue',
                description: 'Get topics due for revision today',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'getRevisionOverdue',
                description: 'Get overdue revision topics',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'getMasteryProgress',
                description: 'Get user\'s mastery progress across L1-L7 levels',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'getStudyStreak',
                description: 'Get user\'s study streak information',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'getStudyInsights',
                description: 'Get comprehensive study insights and analytics',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'getNextBestAction',
                description: 'Get AI recommendation for what to study next',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'getLeaderboardPosition',
                description: 'Get user\'s rank and leaderboard position',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'getMotivationalStats',
                description: 'Get gamification stats like streaks, badges, XP',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'getStudyHoursToday',
                description: 'Get study time for today',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'getWeeklyProgress',
                description: 'Get weekly study goal progress',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'getTestDetails',
                description: 'Get detailed breakdown of a specific test',
                parameters: {
                    type: 'object',
                    properties: {
                        testId: { type: 'string', description: 'Test ID' }
                    },
                    required: ['testId']
                }
            },
            {
                name: 'getQuizByDate',
                description: 'Get quiz attempts within a date range',
                parameters: {
                    type: 'object',
                    properties: {
                        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
                        endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' }
                    },
                    required: ['startDate', 'endDate']
                }
            },
            {
                name: 'getMasteredTopics',
                description: 'Get all topics at mastery level 7',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'getUpcomingRevisions',
                description: 'Get revisions scheduled for next N days',
                parameters: {
                    type: 'object',
                    properties: {
                        days: { type: 'number', description: 'Number of days ahead (default 7)' }
                    }
                }
            },
            {
                name: 'getSkippedQuestions',
                description: 'Get questions user skipped without answering',
                parameters: {
                    type: 'object',
                    properties: {
                        limit: { type: 'number', description: 'Number of questions (default 10)' }
                    }
                }
            },
            {
                name: 'getSlowQuestions',
                description: 'Get questions that took longest time to answer',
                parameters: {
                    type: 'object',
                    properties: {
                        limit: { type: 'number', description: 'Number of questions (default 10)' }
                    }
                }
            },
            {
                name: 'compareWithPeers',
                description: 'Compare user performance with peer average',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'getTimeManagementTips',
                description: 'Get tips to improve time management in tests',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'getQuestionReview',
                description: 'Review specific quiz session questions and answers',
                parameters: {
                    type: 'object',
                    properties: {
                        sessionId: { type: 'string', description: 'Session ID to review' }
                    },
                    required: ['sessionId']
                }
            },
            {
                name: 'getBenchmarkScore',
                description: 'Compare user subject score with platform average',
                parameters: {
                    type: 'object',
                    properties: {
                        subject: { type: 'string', description: 'Subject name (physics, chemistry, biology)' }
                    },
                    required: ['subject']
                }
            },
            {
                name: 'suggestQuizzes',
                description: 'Use ONLY when user explicitly asks for quiz suggestions (e.g., "suggest quiz", "recommend quiz", "give me quiz"). Do NOT use for general queries. Returns quiz suggestions based on saved quizzes and/or subject/chapter/topic filters. Subject is optional; topic-only requests are allowed.',
                parameters: {
                    type: 'object',
                    properties: {
                        topic: { type: 'string', description: 'Optional: specific topic keyword(s) requested by user (e.g., "electrochemistry", "thermodynamics")' },
                        subject: { type: 'string', description: 'Optional: physics, chemistry, biology, mathematics, or general. If user topic is not a NEET subject, omit subject and pass topic only.' },
                        chapter: { type: 'number', description: 'Optional: chapter number (1, 2, 3, etc)' },
                        limit: { type: 'number', description: 'Number of quizzes to suggest. Default is 1. Use the number user specifies if mentioned.' }
                    }
                }
            }
        ];
    }

    async executeTool(toolName, args, userId) {
        const originalToolName = String(toolName || '').trim();
        const normalizedToolName = originalToolName.includes('_')
            ? originalToolName.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
            : originalToolName;

        const toolMap = {
            getLastQuiz: () => AITools.getLastQuiz(userId, args.limit),
            getLastTest: () => AITools.getLastTest(userId, args.limit),
            getOverallAccuracy: () => AITools.getOverallAccuracy(userId),
            getSubjectAccuracy: () => AITools.getSubjectAccuracy(userId, args.subject),
            getChapterAccuracy: () => AITools.getChapterAccuracy(userId, args.subject, args.chapter),
            getAccuracyTrend: () => AITools.getAccuracyTrend(userId, args.days),
            getWeakTopics: () => AITools.getWeakTopics(userId, args.limit),
            getWeakChapters: () => AITools.getWeakChapters(userId, args.subject),
            getRecentlyWrong: () => AITools.getRecentlyWrong(userId, args.limit),
            getRevisionDue: () => AITools.getRevisionDue(userId),
            getRevisionOverdue: () => AITools.getRevisionOverdue(userId),
            getMasteryProgress: () => AITools.getMasteryProgress(userId),
            getStudyStreak: () => AITools.getStudyStreak(userId),
            getStudyInsights: () => AITools.getStudyInsights(userId),
            getNextBestAction: () => AITools.getNextBestAction(userId),
            getLeaderboardPosition: () => AITools.getLeaderboardPosition(userId),
            getMotivationalStats: () => AITools.getMotivationalStats(userId),
            getStudyHoursToday: () => AITools.getStudyHoursToday(userId),
            getWeeklyProgress: () => AITools.getWeeklyProgress(userId),
            getTestDetails: () => AITools.getTestDetails(userId, args.testId),
            getQuizByDate: () => AITools.getQuizByDate(userId, args.startDate, args.endDate),
            getMasteredTopics: () => AITools.getMasteredTopics(userId),
            getUpcomingRevisions: () => AITools.getUpcomingRevisions(userId, args.days),
            getSkippedQuestions: () => AITools.getSkippedQuestions(userId, args.limit),
            getSlowQuestions: () => AITools.getSlowQuestions(userId, args.limit),
            compareWithPeers: () => AITools.compareWithPeers(userId),
            getTimeManagementTips: () => AITools.getTimeManagementTips(userId),
            getQuestionReview: () => AITools.getQuestionReview(userId, args.sessionId),
            getBenchmarkScore: () => AITools.getBenchmarkScore(userId, args.subject),
            suggestQuizzes: () => AITools.suggestQuizzes(userId, { topic: args.topic, subject: args.subject, chapter: args.chapter, limit: args.limit })
        };

        if (!toolMap[normalizedToolName]) {
            throw new Error(`Unknown tool: ${originalToolName}`);
        }

        return await toolMap[normalizedToolName]();
    }

    classifyIntent(message) {
        const msg = message.toLowerCase();
        
        // Last quiz review (must be checked before generic "quiz" detection)
        if (
            msg.includes('review my last quiz') ||
            msg.includes('review last quiz') ||
            msg.includes('my last quiz') ||
            msg.includes('last quiz')
        ) {
            return { type: 'last_quiz_review', confidence: 'high' };
        }

        // Quiz suggestions
        // Only treat as suggestions when user is asking to be given a quiz.
        if (
            msg.includes('suggest') ||
            msg.includes('recommend') ||
            msg.includes('give me') ||
            msg.includes('test me') ||
            (msg.includes('quiz') && (msg.includes('on ') || msg.includes('for ') || msg.includes('quiz on') || msg.includes('quiz for')))
        ) {
            return { type: 'quiz_suggestion', confidence: 'high' };
        }
        
        // Performance stats
        if (msg.includes('accuracy') || msg.includes('score') || msg.includes('performance') || 
            msg.includes('how am i') || msg.includes('how did i')) {
            return { type: 'performance_stats', confidence: 'high' };
        }
        
        // Weak areas
        if (msg.includes('weak') || msg.includes('struggle') || msg.includes('difficult') || 
            msg.includes('improve') || msg.includes('need help')) {
            return { type: 'weak_areas', confidence: 'high' };
        }
        
        // Revision
        if (msg.includes('revision') || msg.includes('review') || msg.includes('revise')) {
            return { type: 'revision', confidence: 'high' };
        }
        
        // Study plan
        if (msg.includes('study') || msg.includes('plan') || msg.includes('schedule') || 
            msg.includes('what should i') || msg.includes('what to')) {
            return { type: 'study_plan', confidence: 'medium' };
        }
        
        return { type: 'general', confidence: 'low' };
    }

    detectDeterministicIntent(message) {
        const msg = String(message || '').toLowerCase();

        // Hard-guard: "review last quiz" should never route to suggestions.
        if (
            msg.includes('review my last quiz') ||
            msg.includes('review last quiz') ||
            msg.includes('my last quiz') ||
            msg.includes('last quiz')
        ) {
            return { type: 'last_quiz_review', confidence: 'high' };
        }

        // Hard-guard: only when user is clearly asking to be given a quiz.
        if (
            msg.includes('suggest') ||
            msg.includes('recommend') ||
            msg.includes('give me') ||
            msg.includes('test me') ||
            (msg.includes('quiz') && (msg.includes('quiz on') || msg.includes('quiz for') || msg.includes(' on ') || msg.includes(' for ')))
        ) {
            return { type: 'quiz_suggestion', confidence: 'high' };
        }

        return null;
    }

    async classifyIntentWithAI(message) {
        const prompt = [
            'You classify a student message into ONE intent.',
            'Return ONLY valid JSON with exactly: {"type":"...","confidence":"high|medium|low"}',
            '',
            'Allowed types:',
            '- last_quiz_review (ONLY if user asks to review last quiz / last attempt / last session)',
            '- quiz_suggestion (ONLY if user asks to be given a quiz, e.g. "give me a quiz on X")',
            '- performance_stats',
            '- weak_areas',
            '- revision',
            '- study_plan',
            '- general',
            '',
            'Important:',
            '- If message contains "last quiz", prefer last_quiz_review.',
            '- If message mentions "quiz" but is not asking to be given one, do NOT choose quiz_suggestion.',
            '',
            `Message: "${String(message || '').replace(/\s+/g, ' ').trim()}"`
        ].join('\n');

        try {
            const GeminiService = require('./geminiService');
            const raw = await GeminiService.generateText(prompt, { maxRetries: 2 });
            const cleaned = String(raw || '')
                .replace(/```json\s*/gi, '')
                .replace(/```/g, '')
                .trim();

            const parsed = JSON.parse(cleaned);
            const type = typeof parsed?.type === 'string' ? parsed.type.trim() : '';
            const confidence = typeof parsed?.confidence === 'string' ? parsed.confidence.trim().toLowerCase() : 'low';

            const allowedTypes = new Set(['last_quiz_review', 'quiz_suggestion', 'performance_stats', 'weak_areas', 'revision', 'study_plan', 'general']);
            if (!allowedTypes.has(type)) return null;
            if (!['high', 'medium', 'low'].includes(confidence)) return null;

            return { type, confidence };
        } catch (e) {
            return null;
        }
    }

    validateResponseJSON(text) {
        // Don't validate - let frontend handle it
        // This prevents false positives from aggressive regex
        return text;
    }

    extractQuizFilters(message) {
        const msg = String(message || '');
        const lower = msg.toLowerCase();

        const subjectCandidates = ['physics', 'chemistry', 'biology', 'mathematics', 'maths', 'general'];
        let subject = undefined;
        for (const s of subjectCandidates) {
            if (lower.includes(s)) {
                subject = s === 'maths' ? 'mathematics' : s;
                break;
            }
        }

        let chapter = undefined;
        const chapterMatch = lower.match(/\b(chapter|ch)\s*(\d{1,2})\b/);
        if (chapterMatch) {
            chapter = Number.parseInt(chapterMatch[2], 10);
        }

        // Strong topic extraction: prefer “quiz on/for/about <topic>”
        let topic = '';
        const topicMatch = lower.match(/\bquiz\s+(on|for|about)\s+(.+)$/i);
        if (topicMatch && topicMatch[2]) {
            topic = String(topicMatch[2]).trim();
        }

        // Remove common instruction words and detected subject/chapter
        if (!topic) topic = msg;

        topic = topic
            .replace(/\bgive me\b/gi, ' ')
            .replace(/\bcan you\b/gi, ' ')
            .replace(/\bplease\b/gi, ' ')
            .replace(/suggest|recommend|give|make|create/gi, ' ')
            .replace(/quiz|quizzes|practice|test me/gi, ' ')
            .replace(/\b(chapter|ch)\s*\d{1,2}\b/gi, ' ')
            .replace(/\b(physics|chemistry|biology|mathematics|maths|general)\b/gi, ' ')
            .replace(/\bme\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!topic) topic = msg.trim();

        // If user didn’t specify subject explicitly, infer from topic
        return { subject, chapter, topic, limit: 1 };
    }

    async chat(userId, message, chatHistory = [], chatSummary = '') {
        try {
            // Production routing:
            // - Deterministic for sensitive flows (quiz suggestions + last quiz review)
            // - AI classifier for everything else
            // - Static fallback if AI fails
            const deterministic = this.detectDeterministicIntent(message);
            const aiIntent = deterministic ? null : await this.classifyIntentWithAI(message);
            const intent = deterministic || aiIntent || this.classifyIntent(message);
            console.log(`Intent detected: ${intent.type} (${intent.confidence})`);

            // Deterministic quiz suggestions: never let model invent/truncate IDs.
            if (intent.type === 'quiz_suggestion') {
                const filters = this.extractQuizFilters(message);
                const suggestions = await AITools.suggestQuizzes(userId, filters);
                const data = (Array.isArray(suggestions) ? suggestions : []).map((s) => ({
                    quizId: s.quizId ? String(s.quizId) : undefined,
                    lineId: s.lineId ? String(s.lineId) : undefined,
                    topic: s.topic,
                    subject: s.subject,
                    chapter: String(s.chapter ?? '')
                }));

                return {
                    message: `Here are some quizzes for you:\n${JSON.stringify({ type: 'quizzes', data })}`
                };
            }

            // Deterministic last quiz review (so it doesn't route to suggestQuizzes)
            if (intent.type === 'last_quiz_review') {
                let summary = null;
                // Prefer detailed last-quiz summary when available.
                if (typeof AITools.getLastQuizDetailed === 'function') {
                    try {
                        summary = await AITools.getLastQuizDetailed(userId);
                    } catch (e) {
                        console.error('getLastQuizDetailed failed, falling back to simple last quiz:', e);
                    }
                }

                // Fallback to simple aggregate last quiz if detailed summary is not available.
                if (!summary) {
                    const last = await AITools.getLastQuiz(userId, 1);
                    if (!Array.isArray(last) || last.length === 0) {
                        return { message: "No data available for your last quiz yet." };
                    }
                    const q = last[0];
                    summary = {
                        meta: {
                            quizId: q.quizId,
                            subject: q.subject,
                            topic: q.topic,
                            chapterId: q.chapterId,
                            date: q.date,
                            score: q.correct,
                            total: q.total,
                            percentage: q.accuracy,
                            timeTaken: q.timeTaken
                        }
                    };
                }

                const analysisMarkdown = await AIAnalysisService.analyzeLastQuizPerformance(summary);
                const header = '## Last quiz summary\n\n';
                const body =
                    typeof analysisMarkdown === 'string' && analysisMarkdown.trim().length > 0
                        ? analysisMarkdown
                        : 'No analysis available for your last quiz yet.';

                return { message: header + body };
            }
            
            // Get user profile for context
            const User = require('../models/User');
            const user = await User.findById(userId).lean();
            
            const userContext = user ? `
Student Profile:
- Name: ${user.name}
- Target Exam: ${user.targetExam || 'NEET'}
- Target Year: ${user.targetYear || 'Not set'}
- Current Class: ${user.currentClass || 'Not set'}
- Study Hours Goal: ${user.analytics?.weeklyGoalHours || 42} hours/week
- Current Level: ${user.gamification?.level || 1}
- Total XP: ${user.gamification?.totalXP || 0}
` : '';

            // Gemini requires history to start with a user role.
            const normalizedHistory = Array.isArray(chatHistory) ? [...chatHistory] : [];
            while (normalizedHistory.length > 0 && normalizedHistory[0].role !== 'user') {
                normalizedHistory.shift();
            }

            const chat = this.model.startChat({
                history: normalizedHistory.map(msg => ({
                    role: msg.role,
                    parts: [{ text: msg.content }]
                })),
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 1200
                }
            });

            const memoryBlock = chatSummary && String(chatSummary).trim().length > 0
                ? `\n\nChat memory (rolling summary):\n${String(chatSummary).trim()}\n`
                : '';

            const systemPrompt = `You are an AI study assistant for NEET exam preparation. You help students analyze their performance, identify weak areas, and provide study recommendations.
${userContext}
${memoryBlock}

CRITICAL RULES - NO GUESSING:
- NEVER calculate accuracy yourself - ONLY use tool data
- NEVER invent scores or statistics
- If tool returns empty/null, say "No data available" - do NOT make up numbers
- ONLY explain and interpret data from tools - do NOT compute

Formatting Guidelines:
- Use **bold** for important points and numbers
- Use bullet points (- ) for lists
- Use numbered lists (1. 2. 3.) for steps
- Use ## for section headers
- Keep responses concise and well-structured

QUIZ SUGGESTIONS - CRITICAL:
When user asks for quizzes (e.g., "organic chemistry quiz", "physics quizzes", "suggest quiz", "give me quiz"), you MUST:
1. Call suggestQuizzes tool with the user's **topic** (if any). Only pass 'subject' when it clearly matches a supported subject (physics/chemistry/biology/mathematics). Do NOT refuse topic-only requests.
2. After receiving tool results, format your response EXACTLY as:
   Brief intro text
   {"type":"quizzes","data":[{"quizId":"optional_if_present","lineId":"optional_if_present","topic":"actual_topic","subject":"actual_subject","chapter":"actual_chapter"}]}
3. The JSON MUST be on its own line and contain the ACTUAL data from the tool result
4. The ids MUST be complete and usable. NEVER shorten ids with "..." or omit characters. If quizId is present, it should be a full 24-character hex MongoDB ObjectId string.
5. Do NOT describe the quizzes in text - ONLY output the JSON with actual ids (quizId/lineId) from tool result

Example correct format:
Here are some chemistry quizzes for you:
{"type":"quizzes","data":[{"quizId":"507f1f77bcf86cd799439011","topic":"Electrochemistry","subject":"chemistry","chapter":"3"}]}

Be concise, encouraging, and actionable. Use the available tools to fetch real data.
When showing data with multiple items, format as JSON for charts: {"type":"chart","chartType":"bar|pie","data":[{"name":"X","value":Y}],"message":"text"}
Current date: ${new Date().toLocaleDateString()}`;

            let result = await chat.sendMessage(systemPrompt + '\n\nStudent: ' + message);
            let response = result.response;

            const maxIterations = 5;
            let iterations = 0;
            let toolsUsedList = [];

            while (response.functionCalls() && iterations < maxIterations) {
                iterations++;
                const functionCalls = response.functionCalls();
                const functionResponses = [];

                for (const call of functionCalls) {
                    console.log(`Executing tool: ${call.name}`, call.args);
                    toolsUsedList.push(call.name);
                    const toolResult = await this.executeTool(call.name, call.args || {}, userId);
                    console.log(`Tool result:`, JSON.stringify(toolResult).substring(0, 200));
                    
                    // Wrap tool result with metadata
                    const wrappedResult = {
                        status: 'success',
                        data: toolResult,
                        meta: {
                            recordCount: Array.isArray(toolResult) ? toolResult.length : (toolResult ? 1 : 0),
                            isEmpty: !toolResult || (Array.isArray(toolResult) && toolResult.length === 0)
                        }
                    };
                    
                    functionResponses.push({
                        functionResponse: {
                            name: call.name,
                            response: wrappedResult
                        }
                    });
                }

                result = await chat.sendMessage(functionResponses);
                response = result.response;
                console.log('Response after tool:', response.text()?.substring(0, 100));
            }

            const responseText = response.text();
            console.log('Final response text:', responseText);
            
            if (!responseText || responseText.trim().length === 0) {
                return {
                    message: 'I retrieved your data but encountered an issue generating a response. Please try asking in a different way.'
                };
            }

            // Validate JSON formats before sending
            const validatedResponse = this.validateResponseJSON(responseText);

            return {
                message: validatedResponse
            };

        } catch (error) {
            console.error('AI Agent Error:', error);
            throw new Error('Failed to process your request. Please try again.');
        }
    }
}

module.exports = AIAgentService;
