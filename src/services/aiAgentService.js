const { GoogleGenerativeAI } = require('@google/generative-ai');
const AITools = require('./aiTools');
const AIAnalysisService = require('./aiAnalysisService');
const PROMPT_TEMPLATES = require('../config/promptTemplates');
const DataSummaryService = require('./dataSummaryService');
const AIUsage = require('../models/AIUsage');

const DECLARATIONS = [
  ['getLastQuiz', 'Get user recent quiz attempts with scores and topics', { limit: { type: 'number' } }],
  ['getLastTest', 'Get user recent test attempts with detailed results', { limit: { type: 'number' } }],
  ['getOverallAccuracy', 'Get user overall performance statistics and accuracy', {}],
  ['getSubjectAccuracy', 'Get accuracy for a specific subject', { subject: { type: 'string' } }, ['subject']],
  ['getChapterAccuracy', 'Get chapter accuracy in a subject', { subject: { type: 'string' }, chapter: { type: 'string' } }, ['subject', 'chapter']],
  ['getAccuracyTrend', 'Get accuracy trend over time', { days: { type: 'number' } }],
  ['getWeakTopics', 'Identify weak topics', { limit: { type: 'number' } }],
  ['getWeakChapters', 'Get weak chapters', { subject: { type: 'string' } }],
  ['getRecentlyWrong', 'Get recently wrong questions', { limit: { type: 'number' } }],
  ['getRevisionDue', 'Get topics due for revision today', {}],
  ['getRevisionOverdue', 'Get overdue revision topics', {}],
  ['getMasteryProgress', 'Get mastery progress across L1-L7 levels', {}],
  ['getStudyStreak', 'Get study streak info', {}],
  ['getStudyInsights', 'Get comprehensive study insights', {}],
  ['getNextBestAction', 'Get next best action', {}],
  ['getLeaderboardPosition', 'Get leaderboard position', {}],
  ['getMotivationalStats', 'Get gamification stats', {}],
  ['getStudyHoursToday', 'Get study hours for today', {}],
  ['getWeeklyProgress', 'Get weekly progress', {}],
  ['getTestDetails', 'Get detailed breakdown of a test', { testId: { type: 'string' } }, ['testId']],
  ['getQuizByDate', 'Get quiz attempts in date range', { startDate: { type: 'string' }, endDate: { type: 'string' } }, ['startDate', 'endDate']],
  ['getMasteredTopics', 'Get mastered topics', {}],
  ['getUpcomingRevisions', 'Get upcoming revisions', { days: { type: 'number' } }],
  ['getSkippedQuestions', 'Get skipped questions', { limit: { type: 'number' } }],
  ['getSlowQuestions', 'Get slow questions', { limit: { type: 'number' } }],
  ['compareWithPeers', 'Compare user performance with peers', {}],
  ['getTimeManagementTips', 'Get time management tips', {}],
  ['getQuestionReview', 'Review specific quiz session', { sessionId: { type: 'string' } }, ['sessionId']],
  ['getBenchmarkScore', 'Compare subject score with benchmark', { subject: { type: 'string' } }, ['subject']],
  ['suggestQuizzes', 'Suggest quizzes for user request', { topic: { type: 'string' }, subject: { type: 'string' }, chapter: { type: 'number' }, limit: { type: 'number' } }],
  ['getCurriculumProgressSummary', 'Get curriculum progress summary', { subject: { type: 'string' } }],
  ['getCurriculumWeakSubtopics', 'Get weak curriculum subtopics', { limit: { type: 'number' }, subject: { type: 'string' } }],
  ['getCurriculumResumeQueue', 'Get resumable curriculum runs', { limit: { type: 'number' } }],
  ['getMockTestCompletionSummary', 'Get mock completion summary', { examType: { type: 'string' }, testType: { type: 'string' }, classCategory: { type: 'string' }, freeOnly: { type: 'boolean' } }],
  ['getMockPendingTests', 'Get pending mock tests', { limit: { type: 'number' }, examType: { type: 'string' }, testType: { type: 'string' }, classCategory: { type: 'string' }, freeOnly: { type: 'boolean' } }],
  ['getCombinedPerformanceTrend', 'Get combined trend across quiz/curriculum/tests', { days: { type: 'number' } }],
  ['buildTodayActionPlan', 'Build prioritized study action plan for today', { timeBudgetMinutes: { type: 'number' }, maxTasks: { type: 'number' } }]
];

class AIAgentService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      tools: [{ functionDeclarations: this.getFunctionDeclarations() }]
    });
    this.doubtModel = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite'
    });
  }

  getFunctionDeclarations() {
    return DECLARATIONS.map(([name, description, properties, required]) => ({
      name,
      description,
      parameters: { type: 'object', properties, ...(Array.isArray(required) && required.length > 0 ? { required } : {}) }
    }));
  }

  withTimeout(promise, timeoutMs = 5000) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Tool timeout after ${timeoutMs}ms`)), timeoutMs))
    ]);
  }

  async executeTool(toolName, args, userId) {
    const normalizedToolName = String(toolName || '').includes('_')
      ? String(toolName).replace(/_([a-z])/g, (_, c) => c.toUpperCase())
      : String(toolName || '');
    const map = {
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
      suggestQuizzes: () => AITools.suggestQuizzes(userId, { topic: args.topic, subject: args.subject, chapter: args.chapter, limit: args.limit }),
      getCurriculumProgressSummary: () => AITools.getCurriculumProgressSummary(userId, args.subject),
      getCurriculumWeakSubtopics: () => AITools.getCurriculumWeakSubtopics(userId, args.limit, args.subject),
      getCurriculumResumeQueue: () => AITools.getCurriculumResumeQueue(userId, args.limit),
      getMockTestCompletionSummary: () => AITools.getMockTestCompletionSummary(userId, args || {}),
      getMockPendingTests: () => AITools.getMockPendingTests(userId, args.limit, args || {}),
      getCombinedPerformanceTrend: () => AITools.getCombinedPerformanceTrend(userId, args.days),
      buildTodayActionPlan: () => AITools.buildTodayActionPlan(userId, args.timeBudgetMinutes, args.maxTasks)
    };
    if (!map[normalizedToolName]) throw new Error(`Unknown tool: ${toolName}`);
    return this.withTimeout(map[normalizedToolName](), 5000);
  }

  detectDeterministicIntent(message) {
    const msg = String(message || '').toLowerCase();

    // Only match "last quiz" if the user is explicitly reviewing it
    if (msg.includes('review my last quiz') || msg === 'last quiz' || msg.includes('how did i do in my last quiz')) return 'last_quiz_review';

    // Today plan — explicit scheduling intent only
    if (msg.includes('what should i do today') || msg.includes('what should i study today') || msg.includes('today plan') || msg.includes('plan my day') || msg.includes('build my today plan')) return 'today_action_plan';

    // Quiz suggestion — MUST contain an explicit quiz/test request word.
    // Generic "give me", "suggest", "recommend" alone are NOT enough — they match too many NEET concept questions.
    const hasQuizWord = msg.includes('quiz') || msg.includes('test me') || msg.includes('give me a quiz') || msg.includes('give me a test') || msg.includes('start a quiz') || msg.includes('practice quiz') || msg.includes('take a quiz');
    const hasTopicContext = msg.includes(' on ') || msg.includes(' for ') || msg.includes(' about ') || msg.includes('physics') || msg.includes('chemistry') || msg.includes('biology');
    if (hasQuizWord && hasTopicContext) return 'quiz_suggestion';
    // explicit standalone quiz request with no topic context still fires
    if (msg === 'give me a quiz' || msg === 'give me a test' || msg === 'start a quiz' || msg === 'test me') return 'quiz_suggestion';

    return null;
  }

  extractQuizFilters(message) {
    const msg = String(message || '');
    const lower = msg.toLowerCase();
    const subjects = ['physics', 'chemistry', 'biology', 'mathematics', 'maths', 'general'];
    const subject = subjects.find((s) => lower.includes(s));
    const chapterMatch = lower.match(/\b(chapter|ch)\s*(\d{1,2})\b/);
    const chapter = chapterMatch ? Number.parseInt(chapterMatch[2], 10) : undefined;
    const topicMatch = lower.match(/\bquiz\s+(on|for|about)\s+(.+)$/i);
    let topic = topicMatch && topicMatch[2] ? String(topicMatch[2]).trim() : msg;
    topic = topic.replace(/suggest|recommend|give me|quiz|practice|test me/gi, ' ').replace(/\s+/g, ' ').trim();
    return { subject: subject === 'maths' ? 'mathematics' : subject, chapter, topic, limit: 1 };
  }

  parseInlinePayloads(text) {
    const decodedText = String(text || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
    let cleanText = decodedText;
    let chartData = null;
    let quizData = null;
    try {
      const chartMatch = decodedText.match(/\{"type":"chart".*?\}/s);
      if (chartMatch) {
        chartData = JSON.parse(chartMatch[0]);
        cleanText = cleanText.replace(chartMatch[0], '').trim();
      }
    } catch {}
    try {
      const quizMatch = decodedText.match(/\{"type":"quizzes"[^}]*"data":\[.*?\]\}/s);
      if (quizMatch) {
        quizData = JSON.parse(quizMatch[0]);
        cleanText = cleanText.replace(quizMatch[0], '').trim();
      }
    } catch {}
    return { cleanText, chartData, quizData };
  }

  buildUiPayload({ message, toolsUsed = [], dataSummary = null, actions = [] }) {
    const { cleanText, chartData, quizData } = this.parseInlinePayloads(message);
    const blocks = [];
    if (cleanText) blocks.push({ type: 'markdown', data: { content: cleanText } });
    if (chartData && chartData.data) blocks.push({ type: 'chart', data: chartData });
    if (quizData && Array.isArray(quizData.data)) blocks.push({ type: 'quiz_suggestions', data: quizData.data });
    if (actions.length > 0) blocks.push({ type: 'actions', data: { items: actions } });
    return {
      blocks,
      actions,
      dataSourcesUsed: dataSummary?.dataSourcesUsed || [],
      toolsUsed,
      dataAvailability: dataSummary?.dataAvailability || 'insufficient',
      lastUpdatedAt: new Date().toISOString()
    };
  }

  buildSystemPrompt({ mode = 'coach', userContext = '', chatSummary = '', summaryText = '', language = 'en' }) {
    const template = mode === 'doubt'
      ? (PROMPT_TEMPLATES.DOUBT_SYSTEM_PROMPT || PROMPT_TEMPLATES.COACH_SYSTEM_PROMPT || PROMPT_TEMPLATES.MASTER_SYSTEM_PROMPT || '')
      : (mode === 'coach'
        ? (PROMPT_TEMPLATES.COACH_SYSTEM_PROMPT || PROMPT_TEMPLATES.MASTER_SYSTEM_PROMPT || '')
        : (PROMPT_TEMPLATES.MASTER_SYSTEM_PROMPT || ''));
    const memoryBlock = chatSummary && String(chatSummary).trim().length > 0 ? `\n\nChat memory (rolling summary):\n${String(chatSummary).trim()}\n` : '';
    const langLine = language === 'hi' ? 'Respond in Hindi first, and keep key terms bilingual (Hindi + English).' : 'Respond in English.';
    return template
      .replace('{STUDENT_CONTEXT}', userContext)
      .replace('{CHAT_MEMORY}', memoryBlock)
      .replace('{SUMMARY_TEXT}', summaryText || 'No data available')
      .replace('{RESPONSE_LANGUAGE}', langLine)
      + `\nCurrent date: ${new Date().toISOString().slice(0, 10)}`;
  }

  async persistUsage(payload) {
    try {
      await AIUsage.create(payload);
    } catch (e) {
      console.warn('Failed to persist AIUsage:', e && e.message);
    }
  }

  async chat(userId, message, chatHistory = [], chatSummary = '', options = {}) {
    const startedAt = Date.now();
    const mode = ['coach', 'analysis', 'doubt'].includes(String(options?.mode || '').toLowerCase())
      ? String(options.mode).toLowerCase()
      : 'coach';
    const clientContext = options?.clientContext || {};
    const userDoc = options?.user || null;
    const language = (clientContext.preferredLanguage || userDoc?.profile?.preferredLanguage || 'en') === 'hi' ? 'hi' : 'en';

    let dataSummary = null;
    let toolsUsed = [];
    const toolErrors = [];

    try {
      dataSummary = await DataSummaryService.generateMasterSummary(userId);
      const intent = this.detectDeterministicIntent(message);

      if (intent === 'today_action_plan') {
        const plan = await AITools.buildTodayActionPlan(userId, 90, 3);
        toolsUsed.push('buildTodayActionPlan');
        const actions = (plan.tasks || []).map((task) => ({
          id: String(task.id),
          label: String(task.title || 'Open'),
          actionType: String(task.actionType || 'none'),
          payload: task.payload || {}
        }));
        const lines = [
          '## Today Plan',
          '',
          `Time budget: **${plan.timeBudgetMinutes} min**`,
          '',
          ...(plan.tasks || []).map((task, idx) => `${idx + 1}. **${task.title}** (${task.durationMinutes} min)\n- ${task.reason}`)
        ];
        const messageText = lines.join('\n');
        return {
          message: messageText,
          toolsUsed,
          dataAvailability: dataSummary?.dataAvailability || 'partial',
          dataSourcesUsed: dataSummary?.dataSourcesUsed || [],
          ui: this.buildUiPayload({ message: messageText, toolsUsed, dataSummary, actions })
        };
      }

      if (intent === 'quiz_suggestion') {
        const suggestions = await AITools.suggestQuizzes(userId, this.extractQuizFilters(message));
        toolsUsed.push('suggestQuizzes');
        const data = (Array.isArray(suggestions) ? suggestions : []).map((s) => ({
          quizId: s.quizId ? String(s.quizId) : undefined,
          lineId: s.lineId ? String(s.lineId) : undefined,
          topic: s.topic,
          subject: s.subject,
          chapter: String(s.chapter ?? ''),
          reason: s.reason
        }));
        const messageText = `Here are some quizzes for you:\n${JSON.stringify({ type: 'quizzes', data })}`;
        const actions = data.map((item, idx) => ({
          id: `quiz-${idx + 1}`,
          label: `Take Quiz: ${item.topic}`,
          actionType: 'take_quiz',
          payload: item
        }));
        return {
          message: messageText,
          toolsUsed,
          dataAvailability: dataSummary?.dataAvailability || 'partial',
          dataSourcesUsed: dataSummary?.dataSourcesUsed || [],
          ui: this.buildUiPayload({ message: messageText, toolsUsed, dataSummary, actions })
        };
      }

      if (intent === 'last_quiz_review') {
        let summary = null;
        if (typeof AITools.getLastQuizDetailed === 'function') {
          try {
            summary = await AITools.getLastQuizDetailed(userId);
            toolsUsed.push('getLastQuizDetailed');
          } catch {
            toolErrors.push('getLastQuizDetailed failed');
          }
        }
        if (!summary) {
          const last = await AITools.getLastQuiz(userId, 1);
          toolsUsed.push('getLastQuiz');
          if (!Array.isArray(last) || last.length === 0) {
            const noData = 'No data available for your last quiz yet.';
            return {
              message: noData,
              toolsUsed,
              dataAvailability: dataSummary?.dataAvailability || 'insufficient',
              dataSourcesUsed: dataSummary?.dataSourcesUsed || [],
              ui: this.buildUiPayload({ message: noData, toolsUsed, dataSummary })
            };
          }
          const q = last[0];
          summary = { meta: { quizId: q.quizId, subject: q.subject, topic: q.topic, chapterId: q.chapterId, date: q.date, score: q.correct, total: q.total, percentage: q.accuracy, timeTaken: q.timeTaken } };
        }
        const analysisMarkdown = await AIAnalysisService.analyzeLastQuizPerformance(summary);
        const messageText = `## Last quiz summary\n\n${typeof analysisMarkdown === 'string' && analysisMarkdown.trim().length > 0 ? analysisMarkdown : 'No analysis available for your last quiz yet.'}`;
        return {
          message: messageText,
          toolsUsed,
          dataAvailability: dataSummary?.dataAvailability || 'partial',
          dataSourcesUsed: dataSummary?.dataSourcesUsed || [],
          ui: this.buildUiPayload({ message: messageText, toolsUsed, dataSummary })
        };
      }

      if (mode === 'doubt') {
        const normalizedHistory = Array.isArray(chatHistory) ? [...chatHistory].slice(-8) : [];
        const historyText = normalizedHistory
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content || '')}`)
          .join('\n');

        const systemPrompt = this.buildSystemPrompt({
          mode,
          userContext: '',
          chatSummary,
          summaryText: '',
          language
        });

        const doubtPrompt = [
          systemPrompt,
          '',
          historyText ? `Recent chat context:\n${historyText}` : '',
          '',
          `Student question: ${String(message || '').trim()}`,
          '',
          'Return only the answer content in markdown.'
        ].join('\n');

        const result = await this.doubtModel.generateContent(doubtPrompt);
        const doubtText = result?.response?.text?.();
        const messageText = (typeof doubtText === 'string' && doubtText.trim().length > 0)
          ? doubtText.trim()
          : 'I could not process that doubt clearly. Please ask again in one line.';

        const payload = {
          message: messageText,
          toolsUsed,
          dataAvailability: dataSummary?.dataAvailability || 'partial',
          dataSourcesUsed: dataSummary?.dataSourcesUsed || [],
          ui: this.buildUiPayload({ message: messageText, toolsUsed, dataSummary })
        };

        await this.persistUsage({
          userId,
          model: 'gemini-2.5-flash-lite',
          promptType: 'doubt_mode',
          latencyMs: Date.now() - startedAt,
          dataAvailability: payload.dataAvailability,
          toolErrors,
          meta: { mode, route: clientContext?.route || null }
        });

        return payload;
      }

      if (!dataSummary.isSufficient) {
        const fallback = 'No sufficient performance data available to generate analysis.';
        return {
          message: fallback,
          toolsUsed,
          dataAvailability: dataSummary?.dataAvailability || 'insufficient',
          dataSourcesUsed: dataSummary?.dataSourcesUsed || [],
          ui: this.buildUiPayload({ message: fallback, toolsUsed, dataSummary })
        };
      }

      const User = require('../models/User');
      const user = userDoc || await User.findById(userId).lean();
      const userContext = user
        ? `Student Profile:\n- Name: ${user.name}\n- Target Exam: ${user.targetExam || 'NEET'}\n- Target Year: ${user.targetYear || 'Not set'}\n- Current Class: ${user.currentClass || 'Not set'}\n- Study Hours Goal: ${user.analytics?.weeklyGoalHours || 42} hours/week\n- Current Level: ${user.gamification?.level || 1}\n- Total XP: ${user.gamification?.totalXP || 0}`
        : '';
      const normalizedHistory = Array.isArray(chatHistory) ? [...chatHistory] : [];
      while (normalizedHistory.length > 0 && normalizedHistory[0].role !== 'user') normalizedHistory.shift();

      const chat = this.model.startChat({
        history: normalizedHistory.map((msg) => ({ role: msg.role, parts: [{ text: msg.content }] })),
        generationConfig: { temperature: mode === 'coach' ? 0.25 : 0.35, maxOutputTokens: 1200 }
      });
      const systemPrompt = this.buildSystemPrompt({ mode, userContext, chatSummary, summaryText: dataSummary.summaryText, language });
      let result = await chat.sendMessage(systemPrompt + '\n\nStudent: ' + message);
      let response = result.response;
      let iterations = 0;

      while (response.functionCalls() && iterations < 5) {
        iterations += 1;
        const functionResponses = [];
        for (const call of response.functionCalls()) {
          toolsUsed.push(call.name);
          try {
            const toolResult = await this.executeTool(call.name, call.args || {}, userId);
            functionResponses.push({ functionResponse: { name: call.name, response: { status: 'success', data: toolResult } } });
          } catch (toolError) {
            const msg = String(toolError?.message || 'Tool failed');
            toolErrors.push(`${call.name}: ${msg}`);
            functionResponses.push({ functionResponse: { name: call.name, response: { status: 'error', error: msg, data: null } } });
          }
        }
        result = await chat.sendMessage(functionResponses);
        response = result.response;
      }

      const responseText = response?.text ? response.text() : '';
      const finalMessage = responseText && responseText.trim().length > 0
        ? responseText
        : 'I retrieved your data but encountered an issue generating a response. Please try asking in a different way.';
      toolsUsed = Array.from(new Set(toolsUsed.filter(Boolean)));

      await this.persistUsage({
        userId,
        model: this.model ? (this.model.model || 'gemini-2.5-flash-lite') : 'gemini-2.5-flash-lite',
        promptType: mode === 'coach' ? 'coach_mode' : (mode === 'analysis' ? 'analysis_mode' : 'master_injected'),
        latencyMs: Date.now() - startedAt,
        dataAvailability: dataSummary?.dataAvailability || 'unknown',
        toolErrors,
        meta: { mode, route: clientContext?.route || null, toolsUsed, dataSourcesUsed: dataSummary?.dataSourcesUsed || [] }
      });

      return {
        message: finalMessage,
        toolsUsed,
        dataAvailability: dataSummary?.dataAvailability || 'partial',
        dataSourcesUsed: dataSummary?.dataSourcesUsed || [],
        ui: this.buildUiPayload({ message: finalMessage, toolsUsed, dataSummary })
      };
    } catch (error) {
      await this.persistUsage({
        userId,
        model: 'gemini-2.5-flash-lite',
        promptType: 'error',
        latencyMs: Date.now() - startedAt,
        dataAvailability: dataSummary?.dataAvailability || 'unknown',
        toolErrors: [...toolErrors, String(error?.message || 'AI agent error')],
        meta: { mode }
      });
      console.error('AI Agent Error:', error);
      throw new Error('Failed to process your request. Please try again.');
    }
  }
}

module.exports = AIAgentService;
