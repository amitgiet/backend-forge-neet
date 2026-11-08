jest.mock('../../src/models/FormulaCard');
jest.mock('../../src/models/FormulaProgress');
jest.mock('axios');

const axios = require('axios');
const FormulaProgress = require('../../src/models/FormulaProgress');
const formulaController = require('../../src/controllers/formulaController');

describe('Formula Flashcards Integration Flow', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
        req = {
            user: { _id: 'u1', id: 'u1' },
            params: {},
            query: {},
            body: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            setHeader: jest.fn().mockReturnThis()
        };
        next = jest.fn();
        jest.clearAllMocks();
    });

    describe('getDueDeck', () => {
        test('queries due cards and returns populated deck', async () => {
            req.query = { chapterTitle: 'Thermodynamics' };

            const mockDueProgress = [
                {
                    _id: 'p1',
                    userId: 'u1',
                    cardId: {
                        _id: 'c1',
                        title: 'First Law of Thermodynamics',
                        formulaLatex: '\\Delta U = Q - W',
                        imgUrl: 'https://cdn.example.com/c1.webp'
                    },
                    easeFactor: 2.5,
                    intervalDays: 1,
                    repetitions: 1,
                    status: 'learning',
                    nextReviewDate: new Date(Date.now() - 3600000)
                }
            ];

            FormulaProgress.find.mockReturnValue({
                sort: jest.fn().mockReturnValue({
                    limit: jest.fn().mockReturnValue({
                        populate: jest.fn().mockReturnValue({
                            lean: jest.fn().mockResolvedValue(mockDueProgress)
                        })
                    })
                })
            });

            await formulaController.getDueDeck(req, res, next);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    count: 1,
                    data: expect.arrayContaining([
                        expect.objectContaining({
                            _id: 'c1',
                            progress: expect.objectContaining({
                                status: 'learning',
                                intervalDays: 1
                            })
                        })
                    ])
                })
            );
        });
    });

    describe('syncFormulaBatch', () => {
        test('rejects request with missing or empty reviews array', async () => {
            req.body = { reviews: [] };
            await formulaController.syncFormulaBatch(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: 'Reviews array required' })
            );
        });

        test('executes bulkWrite with SM-2 calculations for batch reviews', async () => {
            req.body = {
                reviews: [
                    {
                        cardId: 'c1',
                        chapterTitle: 'Thermodynamics',
                        topicTitle: 'First Law',
                        quality: 4
                    },
                    {
                        cardId: 'c2',
                        chapterTitle: 'Thermodynamics',
                        topicTitle: 'Second Law',
                        quality: 1
                    }
                ]
            };

            FormulaProgress.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    {
                        cardId: 'c1',
                        easeFactor: 2.5,
                        intervalDays: 1,
                        repetitions: 1
                    }
                ])
            });

            FormulaProgress.bulkWrite.mockResolvedValue({ ok: 1, modifiedCount: 2 });

            await formulaController.syncFormulaBatch(req, res, next);

            expect(FormulaProgress.bulkWrite).toHaveBeenCalledTimes(1);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                count: 2
            });
        });
    });

    describe('getChapterSummary', () => {
        test('aggregates chapter card progress status counts', async () => {
            req.params = { chapter: 'Thermodynamics' };

            FormulaProgress.aggregate.mockResolvedValue([
                { _id: 'memorized', count: 12 },
                { _id: 'learning', count: 5 },
                { _id: 'need_revision', count: 2 }
            ]);

            await formulaController.getChapterSummary(req, res, next);

            expect(FormulaProgress.aggregate).toHaveBeenCalledWith([
                { $match: { userId: 'u1', chapterTitle: 'Thermodynamics' } },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                summary: {
                    unseen: 0,
                    learning: 5,
                    memorized: 12,
                    need_revision: 2
                }
            });
        });
    });

    describe('proxyDiagramImage', () => {
        test('pipes stream directly without buffering in RAM', async () => {
            req.query = { driveUrl: 'https://drive.google.com/uc?id=12345' };

            const mockPipe = jest.fn();
            axios.get.mockResolvedValue({
                headers: { 'content-type': 'image/webp' },
                data: { pipe: mockPipe }
            });

            await formulaController.proxyDiagramImage(req, res, next);

            expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/webp');
            expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=604800');
            expect(mockPipe).toHaveBeenCalledWith(res);
        });

        test('returns 400 when driveUrl query param is missing', async () => {
            req.query = {};
            await formulaController.proxyDiagramImage(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: 'Valid image URL required' })
            );
        });
    });
});
