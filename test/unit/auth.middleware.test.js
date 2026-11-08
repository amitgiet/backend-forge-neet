const jwt = require('jsonwebtoken');

jest.mock('../../src/models/User', () => ({
    findById: jest.fn()
}));

const User = require('../../src/models/User');
const { protect, authorize } = require('../../src/middleware/auth');

describe('Auth Middleware', () => {
    const JWT_SECRET = 'test-secret-key-123';
    let req;
    let res;
    let next;

    beforeEach(() => {
        process.env.JWT_SECRET = JWT_SECRET;
        req = {
            headers: {},
            cookies: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        next = jest.fn();
        jest.clearAllMocks();
    });

    test('returns 401 when authorization header is missing', async () => {
        await protect(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('rejects demo-token-12345 backdoor with 401 TOKEN_INVALID', async () => {
        req.headers.authorization = 'Bearer demo-token-12345';

        await protect(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                code: 'TOKEN_INVALID'
            })
        );
        expect(next).not.toHaveBeenCalled();
    });

    test('rejects token when tokenVersion does not match user in DB (TOKEN_REVOKED)', async () => {
        const token = jwt.sign({ id: 'u1', tokenVersion: 0 }, JWT_SECRET);
        req.headers.authorization = `Bearer ${token}`;

        User.findById.mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    _id: 'u1',
                    isActive: true,
                    tokenVersion: 1
                })
            })
        });

        await protect(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                code: 'TOKEN_REVOKED'
            })
        );
        expect(next).not.toHaveBeenCalled();
    });

    test('attaches user and calls next when token and tokenVersion are valid', async () => {
        const token = jwt.sign({ id: 'u1', tokenVersion: 2 }, JWT_SECRET);
        req.headers.authorization = `Bearer ${token}`;

        const mockUser = {
            _id: 'u1',
            isActive: true,
            tokenVersion: 2,
            subscription: { plan: 'free' }
        };

        User.findById.mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(mockUser)
            })
        });

        await protect(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(req.user).toEqual(mockUser);
    });

    test('returns 401 TOKEN_EXPIRED when JWT is expired', async () => {
        const expiredToken = jwt.sign(
            { id: 'u1', tokenVersion: 0 },
            JWT_SECRET,
            { expiresIn: -10 }
        );
        req.headers.authorization = `Bearer ${expiredToken}`;

        await protect(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                code: 'TOKEN_EXPIRED'
            })
        );
    });

    test('authorize middleware permits users with matching plan or role', () => {
        const planMiddleware = authorize('pro', 'admin');

        req.user = { subscription: { plan: 'pro' }, role: 'user' };
        planMiddleware(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);

        req.user = { subscription: { plan: 'free' }, role: 'admin' };
        planMiddleware(req, res, next);
        expect(next).toHaveBeenCalledTimes(2);

        req.user = { subscription: { plan: 'free' }, role: 'user' };
        planMiddleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
    });
});
