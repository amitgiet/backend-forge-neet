require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const ImportedQuestion = require('../src/models/ImportedQuestion');

async function backup() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB.');

        console.log('Fetching all ImportedQuestion documents...');
        const questions = await ImportedQuestion.find({}).lean();
        
        console.log(`Found ${questions.length} questions. Saving to backup file...`);
        const backupPath = 'uploads/mongodb_imported_questions_backup.json';
        fs.writeFileSync(backupPath, JSON.stringify(questions, null, 2), 'utf8');
        
        console.log(`✅ Backup successfully saved to ${backupPath}`);
        
        // Let's also create a streamlined backup just of the Hindi translations to make it easier for the user later
        const hiTranslations = questions.map(q => ({
            questionId: q.questionId,
            subject: q.subject,
            questionHi: q.questionHi,
            explanationHi: q.explanationHi,
            optionsHi: q.optionsHi
        })).filter(q => q.questionHi || q.explanationHi);
        
        const hiBackupPath = 'uploads/mongodb_hindi_translations_only.json';
        fs.writeFileSync(hiBackupPath, JSON.stringify(hiTranslations, null, 2), 'utf8');
        
        console.log(`✅ Hindi translations only saved to ${hiBackupPath} (${hiTranslations.length} items found)`);

        process.exit(0);
    } catch (err) {
        console.error('Backup failed:', err);
        process.exit(1);
    }
}

backup();
