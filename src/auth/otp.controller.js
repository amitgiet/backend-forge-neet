const { sendSignupOtp, verifySignupOtp } = require('./otp.service');

// POST /api/v1/auth/send-otp
exports.sendOtp = async (req, res, next) => {
    try {
        const { phone } = req.body;
        const result = await sendSignupOtp(phone);
        return res.status(result.statusCode).json(result.body);
    } catch (error) {
        return next(error);
    }
};

// POST /api/v1/auth/verify-otp
exports.verifyOtp = async (req, res, next) => {
    try {
        const { phone, otp } = req.body;
        const result = await verifySignupOtp(phone, otp);
        return res.status(result.statusCode).json(result.body);
    } catch (error) {
        return next(error);
    }
};
