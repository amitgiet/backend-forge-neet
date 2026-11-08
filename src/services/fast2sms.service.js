const fast2smsService = require('./sms/fast2sms.service');

module.exports = fast2smsService;
module.exports.sendOTP = (phone, otp) => fast2smsService.sendOtp(phone, otp);
