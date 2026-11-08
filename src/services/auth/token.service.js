const jwt = require('jsonwebtoken');

exports.generateAuthToken = (user) => {
    return jwt.sign(
        {
            id: user._id,
            role: user.role || 'user',
            tokenVersion: user.tokenVersion || 0
        },
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_EXPIRE || '30d'
        }
    );
};

exports.verifyAuthToken = (token) => {
    return jwt.verify(token, process.env.JWT_SECRET);
};
