const mongoose = require('mongoose');

const FormulaSubjectSchema = new mongoose.Schema({
    title: { type: String, required: true },
    icon: { type: String },
    position: { type: Number, default: 0 },
    chapters: [{
        title: { type: String, required: true },
        icon: { type: String },
        bgColor: { type: String },
        color: { type: String },
        position: { type: Number, default: 0 },
        cardsCount: { type: Number, default: 0 },
        topicsCount: { type: Number, default: 0 },
        getMarksChapterId: { type: String }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('FormulaSubject', FormulaSubjectSchema);
