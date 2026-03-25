const mongoose = require('mongoose');

const AppDownloadClickSchema = new mongoose.Schema({
    // Which button was clicked: 'android', 'ios', 'web', etc.
    buttonLabel: {
        type: String,
        default: 'unknown'
    },

    // Optional: device / browser info from User-Agent
    userAgent: {
        type: String,
        default: null
    },

    // IP address (for rough geo, de-duplication)
    ipAddress: {
        type: String,
        default: null
    },

    // Referrer page (where did they come from)
    referrer: {
        type: String,
        default: null
    }
}, {
    timestamps: true,
    collection: 'appdownloadclicks'
});

AppDownloadClickSchema.index({ createdAt: -1 });
AppDownloadClickSchema.index({ buttonLabel: 1 });

module.exports = mongoose.model('AppDownloadClick', AppDownloadClickSchema);
