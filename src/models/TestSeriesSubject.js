const mongoose = require('mongoose');

const normalizeName = (value) =>
    String(value || '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const TestSeriesSubjectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    normalizedName: {
        type: String,
        index: true
    },
    examType: {
        type: String,
        enum: ['NEET_UG', 'JEE_MAIN', 'JEE_ADVANCED', 'BITSAT', 'AIIMS'],
        default: 'NEET_UG'
    },
    aliases: [String],
    // Adding an optional icon or color for UI down the line
    icon: { type: String },
    color: { type: String }
}, {
    timestamps: true
});

TestSeriesSubjectSchema.pre('validate', function (next) {
    if (!this.normalizedName) {
        this.normalizedName = normalizeName(this.name);
    }
    next();
});

TestSeriesSubjectSchema.index({ examType: 1, normalizedName: 1 });

module.exports = mongoose.model('TestSeriesSubject', TestSeriesSubjectSchema);
