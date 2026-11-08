const AIAgentService = require('../../src/services/aiAgentService');

describe('AIAgentService - Socratic 3-Strike & Native systemInstruction', () => {
    let service;

    beforeEach(() => {
        service = typeof AIAgentService === 'function' ? new AIAgentService() : AIAgentService;
    });

    describe('buildSocraticPrompt', () => {
        test('generates Strike 1 prompt without formula or direct answer', () => {
            const prompt = service.buildSocraticPrompt(1, { class: '11' });
            expect(prompt).toContain('Target Student: Class 11 Aspirant.');
            expect(prompt).toContain('Current Strike Level: 1');
            expect(prompt).toContain('STRIKE 1: Never reveal the direct answer or final formula. Ask ONE guiding conceptual question');
            expect(prompt).not.toContain('STRIKE 2:');
            expect(prompt).not.toContain('STRIKE 3:');
        });

        test('generates Strike 2 prompt with equation guidance in LaTeX', () => {
            const prompt = service.buildSocraticPrompt(2, { class: '12' });
            expect(prompt).toContain('Current Strike Level: 2');
            expect(prompt).toContain('STRIKE 2: Provide the relevant equation or principle');
            expect(prompt).toContain('\\Delta U = Q - W');
            expect(prompt).not.toContain('STRIKE 1:');
            expect(prompt).not.toContain('STRIKE 3:');
        });

        test('generates Strike 3 prompt with step-by-step derivation and NEET Trap tip', () => {
            const prompt = service.buildSocraticPrompt(3, { class: '12' });
            expect(prompt).toContain('Current Strike Level: 3');
            expect(prompt).toContain('STRIKE 3: Provide the complete step-by-step derivation with clean LaTeX math');
            expect(prompt).toContain('NEET Trap memory tip');
            expect(prompt).not.toContain('STRIKE 1:');
            expect(prompt).not.toContain('STRIKE 2:');
        });
    });

    describe('getModelInstance & Zero System Prompt Leakage', () => {
        test('getModelInstance configures native systemInstruction in GenerativeModel options', () => {
            const mockGetGenerativeModel = jest.fn().mockReturnValue({ model: 'gemini-2.5-flash-lite' });
            service.genAI = { getGenerativeModel: mockGetGenerativeModel };

            service.getModelInstance({ strikeLevel: 1, userContext: { class: '12' } });

            expect(mockGetGenerativeModel).toHaveBeenCalledTimes(1);
            const callArgs = mockGetGenerativeModel.mock.calls[0][0];
            expect(callArgs.model).toBe('gemini-2.5-flash-lite');
            expect(callArgs.systemInstruction).toBeDefined();
            expect(callArgs.systemInstruction.parts[0].text).toContain('STRICT SOCRATIC 3-STRIKE PROTOCOL');
            expect(callArgs.systemInstruction.parts[0].text).toContain('Current Strike Level: 1');
        });

        test('streamDoubtResolution streams chunks and returns token usage from usageMetadata', async () => {
            const mockStreamChunks = [
                { text: () => 'To find ' },
                { text: () => 'the velocity, ' },
                { text: () => 'use $v = u + at$.' }
            ];

            const mockGenerateContentStream = jest.fn().mockResolvedValue({
                stream: (async function* () {
                    for (const c of mockStreamChunks) yield c;
                })(),
                response: Promise.resolve({
                    usageMetadata: {
                        promptTokenCount: 42,
                        candidatesTokenCount: 18
                    }
                })
            });

            service.getModelInstance = jest.fn().mockReturnValue({
                generateContentStream: mockGenerateContentStream
            });

            const onChunk = jest.fn();
            const onComplete = jest.fn();

            await service.streamDoubtResolution({
                message: 'How to calculate velocity?',
                strikeLevel: 2,
                userContext: { class: 12 },
                onChunk,
                onComplete
            });

            expect(onChunk).toHaveBeenCalledTimes(3);
            expect(onChunk).toHaveBeenNthCalledWith(1, 'To find ');
            expect(onChunk).toHaveBeenNthCalledWith(2, 'the velocity, ');
            expect(onChunk).toHaveBeenNthCalledWith(3, 'use $v = u + at$.');

            expect(onComplete).toHaveBeenCalledWith({
                fullText: 'To find the velocity, use $v = u + at$.',
                promptTokens: 42,
                candidateTokens: 18
            });

            const callContents = mockGenerateContentStream.mock.calls[0][0].contents[0];
            expect(callContents.role).toBe('user');
            expect(callContents.parts).toEqual([{ text: 'How to calculate velocity?' }]);
        });

        test('streamDoubtResolution sends inline base64 WebP image payload', async () => {
            const mockGenerateContentStream = jest.fn().mockResolvedValue({
                stream: (async function* () {})(),
                response: Promise.resolve({ usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 } })
            });

            service.getModelInstance = jest.fn().mockReturnValue({
                generateContentStream: mockGenerateContentStream
            });

            await service.streamDoubtResolution({
                message: 'Solve this circuit',
                imageBase64: 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v39gAA=',
                strikeLevel: 1,
                onChunk: jest.fn(),
                onComplete: jest.fn()
            });

            const parts = mockGenerateContentStream.mock.calls[0][0].contents[0].parts;
            expect(parts).toHaveLength(2);
            expect(parts[0]).toEqual({
                inlineData: {
                    mimeType: 'image/webp',
                    data: 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v39gAA='
                }
            });
            expect(parts[1]).toEqual({ text: 'Solve this circuit' });
        });
    });
});
