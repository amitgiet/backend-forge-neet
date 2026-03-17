const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const PDFDocument = require('pdfkit');

const ROOT = process.cwd();
const inputDir = path.resolve(ROOT, 'uploads', 'Topperessentials');
const outputDir = path.resolve(ROOT, 'uploads', 'Topperessentials', 'rebuilt');

async function extractText(pdfPath) {
  const dataBuffer = fs.readFileSync(pdfPath);
  const parsed = await pdfParse(dataBuffer);
  return (parsed.text || '').replace(/\u0000/g, '').trim();
}

function buildPdfFromText(text, outPath, title) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 45, left: 45, right: 45, bottom: 45 },
      autoFirstPage: true,
    });

    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    doc.fontSize(14).text('TopperEssentials - Clean Rebuilt Copy', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#666').text(title, { align: 'center' });
    doc.moveDown(1.2);

    doc.fillColor('#000').fontSize(11).text(text || 'No extractable text found in source PDF.', {
      align: 'left',
      lineGap: 4,
      paragraphGap: 6,
    });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

async function run() {
  fs.mkdirSync(outputDir, { recursive: true });

  const pdfs = fs
    .readdirSync(inputDir)
    .filter((f) => f.toLowerCase().endsWith('.pdf'));

  if (pdfs.length === 0) {
    console.log('No PDFs found in uploads/Topperessentials');
    return;
  }

  for (const file of pdfs) {
    const src = path.join(inputDir, file);
    const out = path.join(outputDir, `rebuilt_${file}`);
    const text = await extractText(src);
    await buildPdfFromText(text, out, file);
    console.log(`Rebuilt: ${file} -> ${path.relative(ROOT, out)}`);
  }
}

run().catch((err) => {
  console.error('Rebuild failed:', err.message);
  process.exit(1);
});
