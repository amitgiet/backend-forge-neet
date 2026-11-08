const User = require('../../src/models/User');

describe('User Model Schema & Validation', () => {
    test('requires password for normal registration without OAuth or phone verification', () => {
        const user = new User({
            name: 'Test Student',
            email: 'student@example.com'
        });

        const validationError = user.validateSync();
        expect(validationError.errors.password).toBeDefined();
        expect(validationError.errors.password.message).toBe('Please provide a password');
    });

    test('allows user creation without password when fromGoogle is true', () => {
        const user = new User({
            name: 'Google Student',
            email: 'google@example.com',
            fromGoogle: true,
            googleId: 'g-123456789'
        });

        const validationError = user.validateSync();
        expect(validationError?.errors?.password).toBeUndefined();
    });

    test('allows user creation without password when fromApple is true', () => {
        const user = new User({
            name: 'Apple Student',
            email: 'apple@example.com',
            fromApple: true
        });

        const validationError = user.validateSync();
        expect(validationError?.errors?.password).toBeUndefined();
    });

    test('allows user creation without password when phoneVerifiedOnly is true', () => {
        const user = new User({
            name: 'Phone Student',
            phone: '9876543210',
            phoneVerifiedOnly: true,
            isPhoneVerified: true
        });

        const validationError = user.validateSync();
        expect(validationError?.errors?.password).toBeUndefined();
    });

    test('tokenVersion defaults to 0 and role defaults to user', () => {
        const user = new User({
            name: 'Default Student',
            phone: '9876543210',
            phoneVerifiedOnly: true
        });

        expect(user.tokenVersion).toBe(0);
        expect(user.role).toBe('user');
    });

    test('getSignedJwtToken includes user id, role, and tokenVersion', () => {
        process.env.JWT_SECRET = 'test-secret-key-123';
        process.env.JWT_EXPIRE = '30d';

        const user = new User({
            name: 'Token Student',
            email: 'token@example.com',
            fromGoogle: true,
            role: 'admin',
            tokenVersion: 2
        });

        const token = user.getSignedJwtToken();
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        expect(decoded.id).toEqual(user._id.toString());
        expect(decoded.role).toBe('admin');
        expect(decoded.tokenVersion).toBe(2);
    });
});
