jest.mock('axios');
const axios = require('axios');
const fast2smsService = require('../../src/services/sms/fast2sms.service');

describe('Fast2SMS Service', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('returns dev sandbox response when NODE_ENV is development and no API key', async () => {
        fast2smsService.isDev = true;
        fast2smsService.apiKey = undefined;

        const result = await fast2smsService.sendOtp('9876543210', '123456');
        expect(result).toEqual({ success: true, sandbox: true });
        expect(axios.post).not.toHaveBeenCalled();
    });

    test('dispatches SMS via axios in production or with API key configured', async () => {
        fast2smsService.isDev = false;
        fast2smsService.apiKey = 'test-api-key';

        axios.post.mockResolvedValue({
            data: {
                return: true,
                request_id: 'req_12345'
            }
        });

        const result = await fast2smsService.sendOtp('9876543210', '654321');
        expect(result).toEqual({ success: true, messageId: 'req_12345' });
        expect(axios.post).toHaveBeenCalledWith(
            'https://www.fast2sms.com/dev/bulkV2',
            {
                variables_values: '654321',
                route: 'otp',
                numbers: '9876543210'
            },
            expect.objectContaining({
                headers: {
                    authorization: 'test-api-key',
                    'Content-Type': 'application/json'
                }
            })
        );
    });

    test('throws error when Fast2SMS API returns failure', async () => {
        fast2smsService.isDev = false;
        fast2smsService.apiKey = 'test-api-key';

        axios.post.mockResolvedValue({
            data: {
                return: false,
                message: 'Invalid numbers'
            }
        });

        await expect(fast2smsService.sendOtp('9876543210', '111111')).rejects.toThrow(
            'Failed to dispatch SMS OTP. Please try again later.'
        );
    });
});
