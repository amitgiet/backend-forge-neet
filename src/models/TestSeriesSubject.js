const mongoose = require('mongoose');

const TestSeriesSubjectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    // Adding an optional icon or color for UI down the line
    icon: { type: String },
    color: { type: String }
}, {
    timestamps: true
});

module.exports = mongoose.model('TestSeriesSubject', TestSeriesSubjectSchema);
