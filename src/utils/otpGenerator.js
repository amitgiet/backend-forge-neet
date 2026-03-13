const crypto = require('crypto');

const generateOTP = () => {
    // Generates a cryptographically strong random 6-digit OTP.
    return crypto.randomInt(100000, 1000000).toString();
};

module.exports = {
    generateOTP
};
