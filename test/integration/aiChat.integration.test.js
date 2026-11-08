const express = require('express');
const request = require('supertest');

jest.mock('../../src/services/aiAgentService', () => {
    return {
        streamDoubtResolution: jest.fn().mockImplementation(async ({ onChunk, onComplete }) => {
            onChunk('Let ');
            onChunk('us solve ');
            onChunk('$\\vec{F} = m\\vec{a}$.');
            onComplete({
                fullText: 'Let us solve $\\vec{F} = m\\vec{a}$.',
                promptTokens: 25,
                candidateTokens: 15
            });
        })
    };
});

jest.mock('../../src/models/AIUsage', () => ({
    create: jest.fn().mockResolvedValue({})
}));

const redisClient = require('../../src/config/redis');
const aiChatController = require('../../src/controllers/aiChatController');

describe('AI Chat SSE Streaming & Rate Limiting Integration', () => {
    let app;
    let mockUser;

    beforeEach(() => {
        jest.clearAllMocks();
        const randId = '507f191e' + Math.floor(Math.random() * 1000000000).toString(16).padStart(16, '0');
        mockUser = {
            _id: randId,
            id: randId,
            name: 'Test Aspirant',
            subscription: { plan: 'free' },
            profile: { targetClass: 12 }
        };

        app = express();
        app.use(express.json());
        // Middleware mocking authenticated req.user
        app.use((req, res, next) => {
            req.user = mockUser;
            next();
        });

        app.post('/api/v1/ai-chat/stream', aiChatController.streamDoubtChat);
    });

    test('validates SSE stream response headers and chunk sequence', async () => {
        const response = await request(app)
            .post('/api/v1/ai-chat/stream')
            .send({
                message: 'Explain Newton second law',
                strikeLevel: 1
            });

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/event-stream');
        expect(response.headers['cache-control']).toContain('no-cache');
        expect(response.headers['connection']).toBe('keep-alive');
        expect(response.headers['x-accel-buffering']).toBe('no');

        const body = response.text;
        expect(body).toContain('event: start');
        expect(body).toContain('event: chunk');
        expect(body).toContain('event: end');
        expect(body).toContain('$\\\\vec{F} = m\\\\vec{a}$.');
        expect(body).toContain('"tokensUsed":40');
    });

    test('returns HTTP 400 when neither message nor image is supplied', async () => {
        const response = await request(app)
            .post('/api/v1/ai-chat/stream')
            .send({ strikeLevel: 1 });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Message or image required');
    });

    test('enforces daily rate limit and returns HTTP 429 when quota exceeded', async () => {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const quotaKey = `quota:user:${mockUser._id}:${today}`;

        // Set quota already reached (20 for free plan)
        await redisClient.set(quotaKey, 20);

        const response = await request(app)
            .post('/api/v1/ai-chat/stream')
            .send({ message: 'Another question' });

        expect(response.status).toBe(429);
        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe('DAILY_QUOTA_EXCEEDED');
        expect(response.body.error).toContain('Daily AI doubt limit reached');
    });

    test('permits higher 200 limit for Pro plan users', async () => {
        mockUser.subscription.plan = 'pro';
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const quotaKey = `quota:user:${mockUser._id}:${today}`;

        // Set at 50 (above free limit, under pro limit)
        await redisClient.set(quotaKey, 50);

        const response = await request(app)
            .post('/api/v1/ai-chat/stream')
            .send({ message: 'Pro student question' });

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/event-stream');
    });
});
