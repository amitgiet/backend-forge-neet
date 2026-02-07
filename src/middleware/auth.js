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

    try {
        // Handle demo token
        if (token === 'demo-token-12345') {
            req.user = {
                _id: 'demo-user-id',
                name: 'Demo User',
                email: 'demo@example.com',
                isActive: true,
                subscription: { plan: 'free' },
                isEmailVerified: true,
                exams: [{ examType: 'NEET' }]
            };
            return next();
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Get user from token
        req.user = await User.findById(decoded.id).select('-password');

        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'User not found'
            });
        }

        // Check if user is active
        if (!req.user.isActive) {
            return res.status(403).json({
                success: false,
                error: 'Account is deactivated'
            });
        }

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(401).json({
            success: false,
            error: 'Not authorized to access this route'
        });
    }
};

// Grant access to specific roles/plans
exports.authorize = (...plans) => {
    return (req, res, next) => {
        if (!plans.includes(req.user.subscription.plan)) {
            return res.status(403).json({
                success: false,
                error: `Subscription plan '${req.user.subscription.plan}' is not authorized to access this route. Required: ${plans.join(', ')}`
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
            req.user = await User.findById(decoded.id).select('-password');
        } catch (error) {
            // Token invalid, but continue anyway
            req.user = null;
        }
    }

    next();
};
