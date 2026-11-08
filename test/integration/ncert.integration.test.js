const express = require('express');
const request = require('supertest');
const { Readable } = require('stream');

// Mock axios for PDF streaming proxy tests
jest.mock('axios');
const axios = require('axios');

// Mock ImportedQuestion for curriculum controller tests
jest.mock('../../src/models/ImportedQuestion', () => ({
    find: jest.fn()
}));
const ImportedQuestion = require('../../src/models/ImportedQuestion');

// Mock protect middleware to pass through
jest.mock('../../src/middleware/auth', () => ({
    protect: (req, res, next) => {
        req.user = { id: 'test_user_id', _id: 'test_user_id' };
        next();
    },
    authorize: () => (req, res, next) => next()
}));

const ncertSearchRoutes = require('../../src/routes/ncertSearchRoutes');
const curriculumRoutes = require('../../src/routes/curriculumRoutes');

describe('NCERT Integration Tests (Story 3)', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        app = express();
        app.use(express.json());
        app.use('/api/v1/ncert-search', ncertSearchRoutes);
        app.use('/api/v1/curriculum', curriculumRoutes);
    });

    describe('PDF Stream Proxy & SSRF Protection', () => {
        test('blocks SSRF attempt targeting cloud metadata (169.254.169.254) with HTTP 403 SSRF_BLOCKED', async () => {
            const res = await request(app)
                .get('/api/v1/ncert-search/pdf-proxy')
                .query({ url: 'http://169.254.169.254/latest/meta-data/' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.code).toBe('SSRF_BLOCKED');
        });

        test('blocks SSRF attempt targeting private IP (192.168.1.1) with HTTP 403 SSRF_BLOCKED', async () => {
            const res = await request(app)
                .get('/api/v1/ncert-search/pdf-proxy')
                .query({ url: 'http://192.168.1.1/admin.pdf' });

            expect(res.status).toBe(403);
            expect(res.body.code).toBe('SSRF_BLOCKED');
        });

        test('streams valid NCERT PDF directly to client with 7-day cache header and zero-RAM piping', async () => {
            const fakePdfStream = new Readable({
                read() {
                    this.push(Buffer.from('%PDF-1.4 test stream content'));
                    this.push(null);
                }
            });

            axios.get.mockResolvedValueOnce({
                headers: {
                    'content-type': 'application/pdf',
                    'content-disposition': 'inline; filename="ncert_chapter.pdf"'
                },
                data: fakePdfStream
            });

            const res = await request(app)
                .get('/api/v1/ncert-search/pdf-proxy')
                .query({ url: 'https://ncert.nic.in/textbook/pdf/keph101.pdf' });

            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toContain('application/pdf');
            expect(res.headers['cache-control']).toBe('public, max-age=604800');
            expect(res.body.toString()).toContain('%PDF-1.4');
        });

        test('blocks redirect to non-whitelisted host', async () => {
            axios.get.mockImplementationOnce((targetUrl, options) => {
                if (options.beforeRedirect) {
                    options.beforeRedirect({
                        protocol: 'http:',
                        host: '169.254.169.254',
                        path: '/latest/meta-data'
                    });
                }
                return Promise.resolve({ data: new Readable({ read() { this.push(null); } }) });
            });

            const res = await request(app)
                .get('/api/v1/ncert-search/pdf-proxy')
                .query({ url: 'https://ncert.nic.in/textbook/pdf/keph101.pdf' });

            expect(res.status).toBe(403);
            expect(res.body.code).toBe('SSRF_BLOCKED');
        });
    });

    describe('Curriculum getQuestionsByUIDs Parameter Validation', () => {
        test('rejects request without subject parameter with HTTP 400', async () => {
            const res = await request(app)
                .get('/api/v1/curriculum/questions')
                .query({ uids: '101,102' });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toContain('Subject parameter is required');
        });

        test('rejects request without uids parameter with HTTP 400', async () => {
            const res = await request(app)
                .get('/api/v1/curriculum/questions')
                .query({ subject: 'physics' });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toContain('Question UIDs array required');
        });

        test('returns questions matching uids and subject on valid request', async () => {
            const mockQuestions = [
                {
                    questionId: '101',
                    subject: 'physics',
                    questionText: 'What is acceleration?',
                    options: { A: 'Rate of change of velocity', B: 'Speed', C: 'Mass', D: 'Force' },
                    correct_option: 'A',
                    isActive: true
                }
            ];

            ImportedQuestion.find.mockReturnValueOnce({
                lean: jest.fn().mockResolvedValueOnce(mockQuestions)
            });

            const res = await request(app)
                .get('/api/v1/curriculum/questions')
                .query({ subject: 'physics', uids: '101' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.length).toBe(1);
            expect(ImportedQuestion.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    subject: 'physics',
                    questionId: { $in: ['101'] }
                })
            );
        });
    });
});
