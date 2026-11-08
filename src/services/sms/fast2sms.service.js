const axios = require('axios');

class Fast2SmsService {
    constructor() {
        this.apiKey = process.env.FAST2SMS_API_KEY;
        this.apiUrl = 'https://www.fast2sms.com/dev/bulkV2';
        this.isDev = process.env.NODE_ENV !== 'production';
    }

    async sendOtp(phone, otp) {
        if (this.isDev && !this.apiKey) {
            console.log(`[Fast2SMS Dev Sandbox] OTP for ${phone}: ${otp}`);
            return { success: true, sandbox: true };
        }

        try {
            const response = await axios.post(
                this.apiUrl,
                {
                    variables_values: otp,
                    route: 'otp',
                    numbers: phone
                },
                {
                    headers: {
                        authorization: this.apiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: 8000
                }
            );

            if (response.data && response.data.return === true) {
                return { success: true, messageId: response.data.request_id };
            }
            throw new Error(response.data?.message || 'Fast2SMS dispatch failed');
        } catch (error) {
            console.error('Fast2SMS Error:', error.response?.data || error.message);
            throw new Error('Failed to dispatch SMS OTP. Please try again later.');
        }
    }
}

module.exports = new Fast2SmsService();
