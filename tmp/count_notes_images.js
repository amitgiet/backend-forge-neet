const fs = require('fs');
const path = require('path');

const logs = [
    { name: 'Biology Notes', file: 'scripts/logs/notes_pdf_migration_log.json' },
    { name: 'Chemistry Notes', file: 'scripts/logs/chem_notes_pdf_migration_log.json' },
    { name: 'Physics Notes', file: 'scripts/logs/phy_notes_pdf_migration_log.json' },
];

let grandTotal = 0;

for (const log of logs) {
    const logPath = path.join(process.cwd(), log.file);
    if (!fs.existsSync(logPath)) {
        console.log(`${log.name}: File not found`);
        continue;
    }
    const entries = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    const successEntries = entries.filter(e => e.status === 'success' || e.status === 'success_duplicate');
    
    let totalImages = 0;
    let pdfCount = 0;
    let imagePageCount = 0;

    for (const e of successEntries) {
        if (e.mode === 'pdf') {
            pdfCount++;
        } else if (e.mode === 'image_pages') {
            imagePageCount++;
            totalImages += (e.pageFiles?.length || e.pageCount || 0);
        }
    }

    grandTotal += totalImages;
    console.log(`\n--- ${log.name} ---`);
    console.log(`  Total chapters: ${successEntries.length}`);
    console.log(`  As PDF (single file): ${pdfCount}`);
    console.log(`  As image pages: ${imagePageCount}`);
    console.log(`  Total individual images: ${totalImages}`);
}

console.log(`\n=== GRAND TOTAL IMAGES: ${grandTotal} ===`);
