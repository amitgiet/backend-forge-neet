const axios = require('axios');

const FAST2SMS_URL = 'https://www.fast2sms.com/dev/bulkV2';

const sendOTP = async (phone, otp) => {
    if (!process.env.FAST2SMS_API_KEY) {
        throw new Error('FAST2SMS_API_KEY is not configured');
    }

    const payload = {
        route: 'q',
        message: `Your verification OTP is ${otp}. Do not share this code.`,
        language: 'english',
        numbers: phone
    };

    const response = await axios.post(FAST2SMS_URL, payload, {
        headers: {
            authorization: process.env.FAST2SMS_API_KEY,
            'Content-Type': 'application/json'
        },
        timeout: 10000
    });

    return response.data;
};

module.exports = {
    sendOTP
};
