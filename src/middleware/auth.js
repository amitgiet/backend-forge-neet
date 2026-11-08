const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - JWT verification
exports.protect = async (req, res, next) => {
    let token;

    // Check for token in headers
    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        token = req.headers.authorization.split(' ')[1];
    }
    // Check for token in cookies
    else if (req.cookies.token) {
        token = req.cookies.token;
    }

    // Make sure token exists
    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Not authorized to access this route'
        });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                code: 'TOKEN_EXPIRED',
                error: 'Session expired'
            });
        }
        return res.status(401).json({
            success: false,
            code: 'TOKEN_INVALID',
            error: 'Invalid authentication token'
        });
    }

    try {
        const user = await User.findById(decoded.id)
            .select('-password')
            .lean();

        if (!user) {
            return res.status(401).json({
                success: false,
                code: 'USER_NOT_FOUND',
                error: 'User account no longer exists'
            });
        }

        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                code: 'ACCOUNT_DEACTIVATED',
                error: 'User account is deactivated'
            });
        }

        const userTokenVersion = user.tokenVersion !== undefined ? user.tokenVersion : 0;
        const decodedTokenVersion = decoded.tokenVersion !== undefined ? decoded.tokenVersion : 0;

        if (decodedTokenVersion !== userTokenVersion) {
            return res.status(401).json({
                success: false,
                code: 'TOKEN_REVOKED',
                error: 'Session has expired. Please log in again.'
            });
        }

        req.user = user;
        next();
    } catch (err) {
        next(err);
    }
};

// Grant access to specific roles/plans
exports.authorize = (...rolesOrPlans) => {
    return (req, res, next) => {
        const userPlan = req.user?.subscription?.plan;
        const userRole = req.user?.role || 'user';
        if (!rolesOrPlans.includes(userPlan) && !rolesOrPlans.includes(userRole)) {
            return res.status(403).json({
                success: false,
                error: `Not authorized to access this route. Required: ${rolesOrPlans.join(', ')}`
            });
        }
        next();
    };
};

// Check if email is verified
exports.checkEmailVerified = (req, res, next) => {
    if (!req.user.isEmailVerified) {
        return res.status(403).json({
            success: false,
            error: 'Please verify your email to access this feature'
        });
    }
    next();
};

// Check exam access
exports.checkExamAccess = (examType) => {
    return (req, res, next) => {
        const userExams = req.user.exams.map(e => e.examType);

        if (!userExams.includes(examType)) {
            return res.status(403).json({
                success: false,
                error: `You don't have access to ${examType}. Please add it to your profile.`
            });
        }
        next();
    };
};

// Optional auth - doesn't fail if no token
exports.optionalAuth = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies.token) {
        token = req.cookies.token;
    }

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('-password').lean();
            const userTokenVersion = user?.tokenVersion !== undefined ? user.tokenVersion : 0;
            const decodedTokenVersion = decoded.tokenVersion !== undefined ? decoded.tokenVersion : 0;
            if (user && user.isActive && decodedTokenVersion === userTokenVersion) {
                req.user = user;
            } else {
                req.user = null;
            }
        } catch (error) {
            req.user = null;
        }
    }

    next();
};
