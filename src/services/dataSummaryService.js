const AITools = require('./aiTools');

class DataSummaryService {
    static toDateLabel(value) {
        if (!value) return 'unknown date';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'unknown date';
        return date.toLocaleDateString();
    }

    static availabilityFromCount(sourceCount) {
        if (sourceCount >= 2) return 'sufficient';
        if (sourceCount === 1) return 'partial';
        return 'insufficient';
    }

    /**
     * Generate a compact master summary for AI chat prompts.
     * Returns:
     * {
     *   summaryText, sourcedFactsCount, isSufficient, dataAvailability,
     *   dataSourcesUsed, trend, hasQuizzes, quizzesCount
     * }
     */
    static async generateMasterSummary(userId) {
        const settled = await Promise.allSettled([
            AITools.getOverallAccuracy(userId),
            AITools.getLastQuiz(userId, 5),
            AITools.getCurriculumProgressSummary(userId),
            AITools.getMockTestCompletionSummary(userId),
            AITools.getStudyInsights(userId),
            AITools.getCombinedPerformanceTrend(userId, 14),
            AITools.getRevisionDue(userId)
        ]);

        const [
            overallRes,
            lastQuizRes,
            curriculumRes,
            mockRes,
            insightsRes,
            combinedTrendRes,
            revisionDueRes
        ] = settled;

        const facts = [];
        let sourcedFactsCount = 0;
        const dataSourcesUsed = [];

        let quizzesCount = 0;
        let hasQuizzes = false;
        let trend = { status: 'unknown', change: 0 };

        if (overallRes.status === 'fulfilled' && overallRes.value) {
            const overall = overallRes.value;
            facts.push(`Overall accuracy: ${Number(overall.accuracy || 0)}%`);
            facts.push(`Questions attempted: ${Number(overall.totalQuestions || 0)}`);
            sourcedFactsCount += 1;
            dataSourcesUsed.push('overall_accuracy');
        }

        if (lastQuizRes.status === 'fulfilled' && Array.isArray(lastQuizRes.value) && lastQuizRes.value.length > 0) {
            const last = lastQuizRes.value[0];
            quizzesCount = lastQuizRes.value.length;
            hasQuizzes = true;
            facts.push(`Last quiz: ${last.topic || 'Unknown'} on ${this.toDateLabel(last.date)} (${Number(last.accuracy || 0)}%)`);
            sourcedFactsCount += 1;
            dataSourcesUsed.push('quiz_attempts');
        }

        if (curriculumRes.status === 'fulfilled' && curriculumRes.value) {
            const c = curriculumRes.value;
            facts.push(
                `Curriculum progress: ${Number(c.completedSubtopics || 0)}/${Number(c.totalAvailableSubtopics || 0)} subtopics completed, ${Number(c.attemptedSubtopics || 0)} attempted, ${Number(c.activeRuns || 0)} active runs`
            );
            if (Number(c.avgBestScore || 0) > 0) {
                facts.push(`Curriculum avg best score: ${Number(c.avgBestScore || 0)}%`);
            }
            if (Number(c.attemptedSubtopics || 0) > 0 || Number(c.activeRuns || 0) > 0) {
                sourcedFactsCount += 1;
                dataSourcesUsed.push('curriculum');
            }
        }

        if (mockRes.status === 'fulfilled' && mockRes.value) {
            const m = mockRes.value;
            facts.push(`Mock tests: ${Number(m.completedTests || 0)} completed, ${Number(m.pendingTests || 0)} pending`);
            if (Number(m.totalTests || 0) > 0) {
                sourcedFactsCount += 1;
                dataSourcesUsed.push('mock_tests');
            }
        }

        if (revisionDueRes.status === 'fulfilled' && revisionDueRes.value) {
            facts.push(`Revisions due today: ${Number(revisionDueRes.value.total || 0)}`);
        }

        if (insightsRes.status === 'fulfilled' && insightsRes.value) {
            const weekly = insightsRes.value.weekly || {};
            facts.push(`Weekly study: ${Number(weekly.completedHours || 0)}h / ${Number(weekly.goalHours || 0)}h goal`);
            if (Number(insightsRes.value.revisionSessions || 0) > 0 || Number(insightsRes.value.totalStudyTime || 0) > 0) {
                sourcedFactsCount += 1;
                dataSourcesUsed.push('revision_sessions');
            }
        }

        if (combinedTrendRes.status === 'fulfilled' && combinedTrendRes.value) {
            const trendData = combinedTrendRes.value;
            trend = trendData.summary || trend;
            if (trend.status && trend.status !== 'unknown') {
                facts.push(`Combined performance trend (14d): ${trend.status} (${Number(trend.change || 0)} pts)`);
            }
            if (Array.isArray(trendData.trend) && trendData.trend.length > 0) {
                sourcedFactsCount += 1;
                dataSourcesUsed.push('combined_trend');
            }
        }

        const uniqueSources = Array.from(new Set(dataSourcesUsed));
        const sourceCount = uniqueSources.length;
        const dataAvailability = this.availabilityFromCount(sourceCount);
        const isSufficient = dataAvailability === 'sufficient';

        return {
            summaryText: facts.length > 0 ? `- ${facts.join('\n- ')}` : 'No data available',
            sourcedFactsCount,
            isSufficient,
            dataAvailability,
            dataSourcesUsed: uniqueSources,
            trend,
            hasQuizzes,
            quizzesCount
        };
    }
}

module.exports = DataSummaryService;
