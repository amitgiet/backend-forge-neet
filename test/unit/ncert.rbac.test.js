const express = require('express');
const request = require('supertest');

// Mock protect to pass through req.user while using the real authorize implementation
jest.mock('../../src/middleware/auth', () => {
    const actual = jest.requireActual('../../src/middleware/auth');
    return {
        protect: (req, res, next) => next(),
        authorize: actual.authorize
    };
});

// Mock pyqMarkedNCERTController
jest.mock('../../src/controllers/pyqMarkedNCERTController', () => ({
    getTopicsBySubject: (req, res) => res.json({ success: true, action: 'getTopicsBySubject' }),
    getAllPYQData: (req, res) => res.json({ success: true, action: 'getAllPYQData' }),
    getTopicById: (req, res) => res.json({ success: true, action: 'getTopicById' }),
    proxyPyqHtml: (req, res) => res.json({ success: true, action: 'proxyPyqHtml' }),
    addTopic: (req, res) => res.json({ success: true, action: 'addTopic' }),
    updateTopic: (req, res) => res.json({ success: true, action: 'updateTopic' }),
    deleteTopic: (req, res) => res.json({ success: true, action: 'deleteTopic' })
}));

const pyqRouter = require('../../src/routes/pyqMarkedNCERTRoutes');

describe('PYQ Marked NCERT RBAC Authorization (P0 Fix)', () => {
    let app;
    let currentUser;

    beforeEach(() => {
        app = express();
        app.use(express.json());

        // Simulate protect middleware setting req.user
        app.use((req, res, next) => {
            req.user = currentUser;
            next();
        });

        app.use('/api/v1/pyq-marked-ncert', pyqRouter);
    });

    test('Public endpoints allow unauthenticated/student requests', async () => {
        currentUser = null;

        const resAll = await request(app).get('/api/v1/pyq-marked-ncert/all');
        expect(resAll.status).toBe(200);
        expect(resAll.body.action).toBe('getAllPYQData');

        const resTopics = await request(app).get('/api/v1/pyq-marked-ncert/topics');
        expect(resTopics.status).toBe(200);
        expect(resTopics.body.action).toBe('getTopicsBySubject');

        const resProxy = await request(app).get('/api/v1/pyq-marked-ncert/html-proxy');
        expect(resProxy.status).toBe(200);
        expect(resProxy.body.action).toBe('proxyPyqHtml');

        const resById = await request(app).get('/api/v1/pyq-marked-ncert/topic-123');
        expect(resById.status).toBe(200);
        expect(resById.body.action).toBe('getTopicById');
    });

    test('Student role attempting mutation endpoints receives HTTP 403 Forbidden', async () => {
        currentUser = {
            _id: 'student_1',
            role: 'student',
            subscription: { plan: 'ultimate', status: 'active' }
        };

        const resAdd = await request(app)
            .post('/api/v1/pyq-marked-ncert/add')
            .send({ topicId: 'cell-cycle', name: 'Cell Cycle' });
        expect(resAdd.status).toBe(403);
        expect(resAdd.body.success).toBe(false);

        const resUpdate = await request(app)
            .put('/api/v1/pyq-marked-ncert/cell-cycle')
            .send({ name: 'Cell Cycle Updated' });
        expect(resUpdate.status).toBe(403);
        expect(resUpdate.body.success).toBe(false);

        const resDelete = await request(app)
            .delete('/api/v1/pyq-marked-ncert/cell-cycle');
        expect(resDelete.status).toBe(403);
        expect(resDelete.body.success).toBe(false);
    });

    test('Admin role can successfully access mutation endpoints', async () => {
        currentUser = {
            _id: 'admin_1',
            role: 'admin'
        };

        const resAdd = await request(app)
            .post('/api/v1/pyq-marked-ncert/add')
            .send({ topicId: 'cell-division', name: 'Cell Division' });
        expect(resAdd.status).toBe(200);
        expect(resAdd.body.action).toBe('addTopic');

        const resUpdate = await request(app)
            .put('/api/v1/pyq-marked-ncert/cell-division')
            .send({ name: 'Cell Division Modified' });
        expect(resUpdate.status).toBe(200);
        expect(resUpdate.body.action).toBe('updateTopic');

        const resDelete = await request(app)
            .delete('/api/v1/pyq-marked-ncert/cell-division');
        expect(resDelete.status).toBe(200);
        expect(resDelete.body.action).toBe('deleteTopic');
    });
});
