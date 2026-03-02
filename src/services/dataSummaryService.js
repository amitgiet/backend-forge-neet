const AITools = require('./aiTools');

class DataSummaryService {
    /**
     * Generate a compact master summary for the user.
     * Returns { summaryText, sourcedFactsCount, isSufficient, trend, hasQuizzes, quizzesCount }
     */
    static async generateMasterSummary(userId) {
        const promises = await Promise.allSettled([
            AITools.getOverallAccuracy(userId),
            AITools.getLastQuiz(userId, 5),
            AITools.getWeakTopics(userId, 5),
            AITools.getRevisionDue(userId),
            AITools.getStudyInsights(userId),
            AITools.getAccuracyTrend(userId, 14)
        ]);

        const [overallRes, lastQuizRes, weakRes, revisionRes, insightsRes, trendRes] = promises;

        let facts = [];
        let count = 0;

        // Overall accuracy
        if (overallRes.status === 'fulfilled' && overallRes.value && typeof overallRes.value.accuracy === 'number') {
            facts.push(`Overall accuracy: ${overallRes.value.accuracy}%`);
            count++;
        }

        // Last quiz(s)
        let quizzesCount = 0;
        if (lastQuizRes.status === 'fulfilled' && Array.isArray(lastQuizRes.value) && lastQuizRes.value.length > 0) {
            const q = lastQuizRes.value[0];
            facts.push(`Last quiz: ${q.topic || 'Unknown'} on ${q.date ? new Date(q.date).toLocaleDateString() : 'unknown date'} - ${q.accuracy}%`);
            count++;
            quizzesCount = lastQuizRes.value.length;
        }

        // Weak topics
        if (weakRes.status === 'fulfilled' && Array.isArray(weakRes.value) && weakRes.value.length > 0) {
            const topics = weakRes.value.slice(0,3).map(t => t.topic || t.lineId || 'unknown');
            facts.push(`Weak topics: ${topics.join(', ')}`);
            count++;
        }

        // Revisions due
        if (revisionRes.status === 'fulfilled' && revisionRes.value && typeof revisionRes.value.total === 'number') {
            facts.push(`Revisions due: ${revisionRes.value.total}`);
            if (revisionRes.value.total > 0) count++;
        }

        // Study insights
        if (insightsRes.status === 'fulfilled' && insightsRes.value) {
            const ins = insightsRes.value;
            facts.push(`Weekly progress: ${ins.completed || 0}h completed, goal ${ins.goal || 0}h`);
            count++;
        }

        // Trend detection (improving/declining/stable)
        let trend = { status: 'unknown', change: 0 };
        try {
            if (trendRes.status === 'fulfilled' && Array.isArray(trendRes.value) && trendRes.value.length >= 2) {
                const arr = trendRes.value.map(d => ({ date: d.date, accuracy: Number(d.accuracy || 0) }));
                const first = arr[0].accuracy || 0;
                const last = arr[arr.length - 1].accuracy || 0;
                const diff = last - first;
                trend.change = Math.round(diff * 100) / 100;
                if (diff > 2) trend.status = 'improving';
                else if (diff < -2) trend.status = 'declining';
                else trend.status = 'stable';
                facts.push(`Accuracy trend (last ${arr.length} days): ${trend.status} (${trend.change} pts)`);
                count++;
            }
        } catch (e) {
            // ignore trend errors
        }

        const summaryText = facts.length > 0 ? facts.join('\n- ') : 'No data available';

        const hasQuizzes = quizzesCount > 0;

        // Heuristic: sufficient if at least 2 sourced facts exist AND user has at least one quiz attempt
        const isSufficient = count >= 2 && hasQuizzes;

        return {
            summaryText: (summaryText && summaryText !== 'No data available') ? `- ${summaryText}` : 'No data available',
            sourcedFactsCount: count,
            isSufficient,
            trend,
            hasQuizzes,
            quizzesCount
        };
    }
}

module.exports = DataSummaryService;
