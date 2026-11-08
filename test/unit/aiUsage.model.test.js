const mongoose = require('mongoose');
const AIUsage = require('../../src/models/AIUsage');

describe('AIUsage Model', () => {
    test('instantiates valid AIUsage document with exact prompt & completion token counts', () => {
        const userId = new mongoose.Types.ObjectId();
        const doc = new AIUsage({
            userId,
            service: 'doubt_solver',
            model: 'gemini-2.5-flash-lite',
            promptTokens: 145,
            completionTokens: 89,
            totalTokens: 234,
            metadata: { strikeLevel: 2, hasImage: false }
        });

        expect(doc.userId).toEqual(userId);
        expect(doc.service).toBe('doubt_solver');
        expect(doc.model).toBe('gemini-2.5-flash-lite');
        expect(doc.promptTokens).toBe(145);
        expect(doc.completionTokens).toBe(89);
        expect(doc.totalTokens).toBe(234);
        expect(doc.metadata.strikeLevel).toBe(2);
        expect(doc.metadata.hasImage).toBe(false);
    });

    test('applies schema defaults for promptTokens, completionTokens, and totalTokens', () => {
        const userId = new mongoose.Types.ObjectId();
        const doc = new AIUsage({
            userId
        });

        expect(doc.promptTokens).toBe(0);
        expect(doc.completionTokens).toBe(0);
        expect(doc.totalTokens).toBe(0);
        expect(doc.service).toBe('doubt_solver');
        expect(doc.model).toBe('gemini-2.5-flash-lite');
    });

    test('fails validation when userId is missing', () => {
        const doc = new AIUsage({
            service: 'doubt_solver',
            promptTokens: 10
        });

        const err = doc.validateSync();
        expect(err.errors.userId).toBeDefined();
    });
});
