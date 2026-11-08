const bcrypt = require('bcryptjs');

jest.mock('../../src/models/User');
jest.mock('../../src/models/OtpVerification');
jest.mock('../../src/models/Token');
jest.mock('../../src/services/sms/fast2sms.service', () => ({
    sendOtp: jest.fn().mockResolvedValue({ success: true, sandbox: true })
}));
jest.mock('google-auth-library', () => {
    return {
        OAuth2Client: jest.fn().mockImplementation(() => ({
            verifyIdToken: jest.fn().mockResolvedValue({
                getPayload: jest.fn().mockReturnValue({
                    sub: 'google-sub-12345',
                    email: 'googleuser@example.com',
                    name: 'Google Aspirant',
                    picture: 'https://avatar.example.com/photo.jpg'
                })
            })
        }))
    };
});

const User = require('../../src/models/User');
const OtpVerification = require('../../src/models/OtpVerification');
const authController = require('../../src/controllers/authController');

describe('Auth Controller Integration / Unit Flow', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
        process.env.JWT_SECRET = 'test-secret';
        process.env.JWT_EXPIRE = '30d';
        req = {
            body: {},
            headers: {},
            cookies: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            cookie: jest.fn().mockReturnThis()
        };
        next = jest.fn();
        jest.clearAllMocks();
    });

    describe('sendOtp', () => {
        test('rejects invalid phone numbers with HTTP 400', async () => {
            req.body.phone = '12345';
            await authController.sendOtp(req, res, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: 'Please enter a valid 10-digit mobile number' })
            );
        });

        test('enforces 30s cooldown with HTTP 429', async () => {
            req.body.phone = '9876543210';
            OtpVerification.findOne.mockResolvedValue({
                phone: '9876543210',
                lastSentAt: new Date(Date.now() - 10000) // 10 seconds ago
            });

            await authController.sendOtp(req, res, next);
            expect(res.status).toHaveBeenCalledWith(429);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: 'Please wait 30 seconds before requesting a new OTP' })
            );
        });

        test('creates/upserts OTP record and returns HTTP 200 on success', async () => {
            req.body.phone = '9876543210';
            OtpVerification.findOne.mockResolvedValue(null);
            OtpVerification.findOneAndUpdate.mockResolvedValue({});

            await authController.sendOtp(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true, message: 'OTP sent successfully' })
            );
            expect(OtpVerification.findOneAndUpdate).toHaveBeenCalled();
        });
    });

    describe('verifyOtpLogin', () => {
        test('returns HTTP 400 when OTP record is missing or expired', async () => {
            req.body = { phone: '9876543210', otp: '123456' };
            OtpVerification.findOne.mockResolvedValue(null);

            await authController.verifyOtpLogin(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: 'Invalid or expired OTP' })
            );
        });

        test('returns HTTP 400 and increments attempts on incorrect OTP', async () => {
            const hash = await bcrypt.hash('654321', 10);
            req.body = { phone: '9876543210', otp: '123456' };
            OtpVerification.findOne.mockResolvedValue({
                _id: 'otp1',
                phone: '9876543210',
                otpHash: hash,
                attempts: 0
            });

            await authController.verifyOtpLogin(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(OtpVerification.updateOne).toHaveBeenCalledWith(
                { _id: 'otp1' },
                { $inc: { attempts: 1 } }
            );
        });

        test('locks out after 3 failed attempts', async () => {
            req.body = { phone: '9876543210', otp: '123456' };
            OtpVerification.findOne.mockResolvedValue({
                _id: 'otp1',
                phone: '9876543210',
                attempts: 3
            });

            await authController.verifyOtpLogin(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: 'Too many invalid attempts. Please request a new OTP.' })
            );
            expect(OtpVerification.deleteOne).toHaveBeenCalledWith({ _id: 'otp1' });
        });

        test('successfully logs in, deletes OTP record, and issues token', async () => {
            const hash = await bcrypt.hash('123456', 10);
            req.body = { phone: '9876543210', otp: '123456' };
            OtpVerification.findOne.mockResolvedValue({
                _id: 'otp1',
                phone: '9876543210',
                otpHash: hash,
                attempts: 1
            });

            const mockUser = {
                _id: 'u1',
                name: 'NEET Aspirant',
                phone: '9876543210',
                role: 'user',
                tokenVersion: 0,
                subscription: { plan: 'free' },
                getSignedJwtToken: jest.fn().mockReturnValue('mock-jwt-token'),
                updateStreak: jest.fn(),
                save: jest.fn().mockResolvedValue(true)
            };

            User.findOne.mockResolvedValue(mockUser);

            await authController.verifyOtpLogin(req, res, next);
            expect(OtpVerification.deleteOne).toHaveBeenCalledWith({ _id: 'otp1' });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    token: 'mock-jwt-token'
                })
            );
        });
    });

    describe('googleLogin', () => {
        test('verifies idToken and creates new user without password', async () => {
            req.body = { idToken: 'valid-google-id-token' };
            User.findOne.mockResolvedValue(null);

            const createdUser = {
                _id: 'g-user-1',
                name: 'Google Aspirant',
                email: 'googleuser@example.com',
                fromGoogle: true,
                role: 'user',
                tokenVersion: 0,
                subscription: { plan: 'free' },
                getSignedJwtToken: jest.fn().mockReturnValue('google-jwt-token')
            };

            User.create.mockResolvedValue(createdUser);

            await authController.googleLogin(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    token: 'google-jwt-token'
                })
            );
        });
    });

    describe('logout', () => {
        test('increments tokenVersion and clears session cookie', async () => {
            req.user = { _id: 'u1', id: 'u1' };
            User.findByIdAndUpdate.mockResolvedValue({});

            await authController.logout(req, res, next);
            expect(User.findByIdAndUpdate).toHaveBeenCalledWith('u1', {
                $inc: { tokenVersion: 1 }
            });
            expect(res.cookie).toHaveBeenCalledWith(
                'token',
                'none',
                expect.any(Object)
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true, message: 'Logged out from all sessions' })
            );
        });
    });
});
