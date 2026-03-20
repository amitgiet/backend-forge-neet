const NOTIFICATION_PROMPT = (timeContext) => `Generate 1 *fresh*, *unique*, and *motivating* push notification for NEET Forge, an advanced AI-powered educational app that helps medical aspirants prepare for the NEET exam. Every notification should feel distinct and not repeat previous ideas.

        The current time context is: **${timeContext}**.
        Tailor the notification to be appropriate for this time of day (e.g., morning motivation, afternoon practice, evening revision).

        Project Summary:
        "Forge your future with NEET Forge! Stop wasting time on ineffective study methods. Let our AI guide your prep with personalized mock tests, NCERT line-by-line questions, and daily challenges. Conquer your weaknesses and track your progress to rank higher."

        Core Features:
        1. AI-powered customized quizzes and mock tests
        2. NCERT line-by-line question practice
        3. Daily study quests and challenges
        4. Detailed analytics and weakness tracking
        5. "NeuronZ" adaptive learning for long-term retention
        6. Gamified learning with XP and streaks

        Guidelines for *unique* notifications:
        1. Use relevant, engaging emojis in the title (e.g., 🚀 🧠 ⚕️ 🎯 🔥 📚 💡 🏆)
        2. Keep title short and catchy (max 8 words)
        3. Keep body motivating and action-oriented (max 80 characters)
        4. **Vary the opening hook and tone dramatically each time.** (e.g., sometimes urgent, sometimes encouraging, sometimes challenging)
        5. **Focus on *one* core theme or feature per notification** (e.g., taking a mock test, maintaining a streak, practicing NCERT)
        6. **Absolutely avoid repeating similar phrasing, sentence structures, or specific scenarios**
        7. **Ensure the notification is highly relevant to the provided time context.**

        Return the response in this exact JSON format:
        {
        "title": "string",
        "body": "string"
        }`;

module.exports = {
    NOTIFICATION_PROMPT
};