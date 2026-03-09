const mongoose = require('mongoose');

const FormulaCardSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    imgUrl: { type: String, required: true },
    subjectTitle: { type: String, required: true, index: true },
    chapterTitle: { type: String, required: true, index: true },
    topicTitle: { type: String, required: true, index: true },
    position: { type: Number, default: 0 },
    getMarksId: { type: String, unique: true, sparse: true }
}, {
    timestamps: true
});

FormulaCardSchema.index({ subjectTitle: 1, chapterTitle: 1, topicTitle: 1 });

module.exports = mongoose.model('FormulaCard', FormulaCardSchema);
