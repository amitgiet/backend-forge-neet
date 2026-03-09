const mongoose = require('mongoose');
const ImportedQuestion = require('./src/models/ImportedQuestion');

mongoose.connect('mongodb+srv://bharatojha123:bharat123@cluster0.lzaypwq.mongodb.net/neetforge?retryWrites=true&w=majority').then(async () => {
    const qs = await ImportedQuestion.find({ questionId: { $in: ['50102', '50104', '50105'] } });
    console.log(JSON.stringify(qs.map(q => ({ id: q.questionId, opt: q.correct_option, ans: q.correct_answer })), null, 2));
    process.exit(0);
});
