const crypto = require('crypto');
const User = require('../models/User');
const otpStore = require('./otp.store');
const { generateOTP } = require('../utils/otpGenerator');
const { sendOTP } = require('../services/fast2sms.service');

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_COOLDOWN_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 3;
const OTP_MAX_REQUESTS_PER_HOUR = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '');

const isValidPhone = (phone) => /^[6-9]\d{9}$/.test(phone);

const isValidOtp = (otp) => /^\d{6}$/.test(String(otp || ''));

const hashOtp = (otp) =>
    crypto
        .createHash('sha256')
        .update(String(otp))
        .digest('hex');

const sendSignupOtp = async (rawPhone) => {
    const phone = normalizePhone(rawPhone);

    if (!isValidPhone(phone)) {
        return {
            statusCode: 400,
            body: { success: false, message: 'Invalid phone number' }
        };
    }

    const now = new Date();
    const existingRecord = await otpStore.getByPhone(phone);

    // Enforce resend cooldown: one OTP every 30 seconds.
    if (
        existingRecord?.lastSentAt &&
        now.getTime() - new Date(existingRecord.lastSentAt).getTime() < OTP_COOLDOWN_MS
    ) {
        return {
            statusCode: 429,
            body: {
                success: false,
                message: 'Please wait before requesting a new OTP'
            }
        };
    }

    // Enforce per-phone hourly request cap.
    const shouldResetWindow =
        !existingRecord?.requestWindowStart ||
        now.getTime() - new Date(existingRecord.requestWindowStart).getTime() >= RATE_LIMIT_WINDOW_MS;

    const requestCount = shouldResetWindow ? 0 : existingRecord.requestCount || 0;

    if (requestCount >= OTP_MAX_REQUESTS_PER_HOUR) {
        return {
            statusCode: 429,
            body: {
                success: false,
                message: 'OTP request limit reached. Try again later'
            }
        };
    }

    // Generate and hash OTP before storage.
    const otp = generateOTP();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MS);

    // Persist OTP metadata in DB first so verification can always be resolved server-side.
    await otpStore.upsertByPhone(phone, {
        otpHash,
        expiresAt,
        attempts: 0,
        lastSentAt: now,
        requestCount: requestCount + 1,
        requestWindowStart: shouldResetWindow ? now : existingRecord.requestWindowStart,
        isVerified: false,
        verifiedAt: null
    });

    try {
        await sendOTP(phone, otp);
    } catch (error) {
        // If SMS delivery fails, clear active OTP to avoid unusable codes in DB.
        await otpStore.clearOtpData(phone);
        throw error;
    }

    return {
        statusCode: 200,
        body: {
            success: true,
            message: 'OTP sent successfully'
        }
    };
};

const verifySignupOtp = async (rawPhone, otpInput) => {
    const phone = normalizePhone(rawPhone);
    const otp = String(otpInput || '');

    if (!isValidPhone(phone)) {
        return {
            statusCode: 400,
            body: { success: false, message: 'Invalid phone number' }
        };
    }

    if (!isValidOtp(otp)) {
        return {
            statusCode: 400,
            body: { success: false, message: 'Invalid OTP' }
        };
    }

    const record = await otpStore.getByPhone(phone);

    if (!record?.otpHash || !record?.expiresAt) {
        return {
            statusCode: 400,
            body: { success: false, message: 'Invalid OTP' }
        };
    }

    if ((record.attempts || 0) >= OTP_MAX_ATTEMPTS) {
        await otpStore.clearOtpData(phone);
        return {
            statusCode: 429,
            body: { success: false, message: 'Maximum OTP attempts exceeded' }
        };
    }

    const now = Date.now();
    if (new Date(record.expiresAt).getTime() < now) {
        await otpStore.clearOtpData(phone);
        return {
            statusCode: 400,
            body: { success: false, message: 'OTP has expired' }
        };
    }

    const isMatch = hashOtp(otp) === record.otpHash;
    if (!isMatch) {
        const updated = await otpStore.incrementAttempts(phone);
        if ((updated?.attempts || 0) >= OTP_MAX_ATTEMPTS) {
            await otpStore.clearOtpData(phone);
        }

        return {
            statusCode: 400,
            body: { success: false, message: 'Invalid OTP' }
        };
    }

    // Mark phone verified and remove active OTP values.
    await otpStore.markVerifiedAndClearOtp(phone);

    // If a user already exists with this phone, mark that account as phone-verified.
    await User.updateOne({ phone }, { $set: { isPhoneVerified: true } });

    return {
        statusCode: 200,
        body: {
            success: true,
            message: 'OTP verified successfully'
        }
    };
};

const consumeVerifiedPhone = async (rawPhone) => {
    const phone = normalizePhone(rawPhone);
    if (!isValidPhone(phone)) return false;

    const record = await otpStore.consumeVerifiedPhone(phone);
    return Boolean(record);
};

module.exports = {
    sendSignupOtp,
    verifySignupOtp,
    consumeVerifiedPhone
};
