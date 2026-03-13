const OtpVerification = require('../models/OtpVerification');

const getByPhone = async (phone) => {
    return OtpVerification.findOne({ phone });
};

const upsertByPhone = async (phone, update) => {
    return OtpVerification.findOneAndUpdate(
        { phone },
        { $set: update },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
};

const incrementAttempts = async (phone) => {
    return OtpVerification.findOneAndUpdate(
        { phone },
        { $inc: { attempts: 1 } },
        { new: true }
    );
};

const markVerifiedAndClearOtp = async (phone) => {
    return OtpVerification.findOneAndUpdate(
        { phone },
        {
            $set: {
                otpHash: null,
                expiresAt: null,
                attempts: 0,
                isVerified: true,
                verifiedAt: new Date()
            }
        },
        { new: true }
    );
};

const clearOtpData = async (phone) => {
    return OtpVerification.findOneAndUpdate(
        { phone },
        {
            $set: {
                otpHash: null,
                expiresAt: null,
                attempts: 0
            }
        },
        { new: true }
    );
};

const consumeVerifiedPhone = async (phone) => {
    const record = await OtpVerification.findOneAndUpdate(
        { phone, isVerified: true },
        { $set: { isVerified: false } },
        { new: true }
    );

    return record;
};

module.exports = {
    getByPhone,
    upsertByPhone,
    incrementAttempts,
    markVerifiedAndClearOtp,
    clearOtpData,
    consumeVerifiedPhone
};
