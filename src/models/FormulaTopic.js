const mongoose = require('mongoose');

const FormulaTopicSchema = new mongoose.Schema({
    title: { type: String, required: true },
    chapterTitle: { type: String, required: true },
    subjectTitle: { type: String, required: true },
    position: { type: Number, default: 0 },
    coverImage: { type: String },
    cardsCount: { type: Number, default: 0 },
    getMarksTopicId: { type: String, unique: true, sparse: true }
}, {
    timestamps: true
});

FormulaTopicSchema.index({ subjectTitle: 1, chapterTitle: 1 });

module.exports = mongoose.model('FormulaTopic', FormulaTopicSchema);
