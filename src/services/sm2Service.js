class SM2Service {
    /**
     * Calculates the next review date and ease factor based on student rating.
     * @param {Object} current - { easeFactor, intervalDays, repetitions }
     * @param {number} quality - Rating: 1 (Again), 3 (Hard), 4 (Good), 5 (Easy)
     */
    calculateNextReview(current, quality) {
        let { easeFactor = 2.5, intervalDays = 0, repetitions = 0 } = current;

        // 1. Calculate new Ease Factor: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
        const newEaseFactor = Math.max(
            1.3,
            easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        );

        let newInterval;
        let newRepetitions;
        let newStatus;

        if (quality < 3) {
            // Failed recall (Again)
            newRepetitions = 0;
            newInterval = 1;
            newStatus = 'need_revision';
        } else {
            // Successful recall
            if (repetitions === 0) {
                newInterval = quality === 5 ? 2 : 1;
            } else if (repetitions === 1) {
                newInterval = 6;
            } else {
                const multiplier = quality === 5 ? newEaseFactor * 1.3 : (quality === 3 ? 1.2 : newEaseFactor);
                newInterval = Math.max(1, Math.round(intervalDays * multiplier));
            }

            newRepetitions = repetitions + 1;
            newStatus = newInterval >= 21 ? 'memorized' : 'learning';
        }

        const nextReviewDate = new Date();
        nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);

        return {
            easeFactor: parseFloat(newEaseFactor.toFixed(2)),
            intervalDays: newInterval,
            repetitions: newRepetitions,
            nextReviewDate,
            status: newStatus
        };
    }
}

module.exports = new SM2Service();
