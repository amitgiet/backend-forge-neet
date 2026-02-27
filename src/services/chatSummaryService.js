const GeminiService = require('./geminiService');

class ChatSummaryService {
  /**
   * Update a rolling summary.
   * @param {object} params
   * @param {string} params.previousSummary
   * @param {Array<{sender:'user'|'ai',content:string}>} params.recentMessages
   */
  static async summarize({ previousSummary = '', recentMessages = [] }) {
    const transcript = (recentMessages || [])
      .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
      .map((m) => `${m.sender === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const prompt = `You are maintaining a long-running memory summary for an AI tutoring chat.

Write a concise rolling summary that will be used as context in future messages.

Rules:
- Keep it under 1200 characters.
- Include the student's preferences/goals, current topics, and any important decisions.
- Do NOT include long verbatim excerpts.
- If the previous summary is empty, create an initial summary.

Previous summary:
${previousSummary || '(none)'}

Recent messages:
${transcript || '(none)'}

Return ONLY the updated summary text.`;

    const text = await GeminiService.generateText(prompt, { maxRetries: 2 });
    return String(text || '').trim();
  }
}

module.exports = ChatSummaryService;

