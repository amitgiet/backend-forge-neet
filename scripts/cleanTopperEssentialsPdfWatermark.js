const fs = require("fs/promises");
const path = require("path");
const { PDFDocument, PDFName, PDFDict, PDFNumber } = require("pdf-lib");

const ROOT = process.cwd();

const inputFolder = path.join(ROOT, "uploads", "Topperessentials");
const outputFolder = path.join(ROOT, "uploads", "Topperessentials", "cleaned");

async function removeWatermarkObjects(inputPath, outputPath) {

  const pdfBytes = await fs.readFile(inputPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  const pages = pdfDoc.getPages();

  for (const page of pages) {

    const node = page.node;
    const resources = node.Resources();

    if (!resources) continue;

    const xObjectDict = resources.lookup(PDFName.of("XObject"), PDFDict);
    if (!xObjectDict) continue;

    const keys = xObjectDict.keys();

    for (const key of keys) {

      const name = key.decodeText();
      const obj = xObjectDict.lookup(key);

      if (!obj) continue;

      const objectDict =
        typeof obj.get === "function"
          ? obj
          : obj.dict && typeof obj.dict.get === "function"
            ? obj.dict
            : null;

      if (!objectDict) continue;

      const subtype = objectDict.get(PDFName.of("Subtype"));
      const width = objectDict.get(PDFName.of("Width"));
      const height = objectDict.get(PDFName.of("Height"));

      const subtypeName = subtype?.decodeText?.() || "";

      const w = width instanceof PDFNumber ? width.asNumber() : null;
      const h = height instanceof PDFNumber ? height.asNumber() : null;

      console.log("Object:", name, "Subtype:", subtypeName, "Size:", w, h);

      // watermark detection based on size
      if (subtypeName === "Image" && w === 210 && h === 197) {

        console.log("Removing watermark image:", name);

        xObjectDict.delete(key);

      }

    }

  }

  // Remove first page (index 0) from output PDF when present.
  if (pdfDoc.getPageCount() > 0) {
    pdfDoc.removePage(0);
  }

  const pdfBytesModified = await pdfDoc.save({
    useObjectStreams: false
  });

  await fs.writeFile(outputPath, pdfBytesModified);

}

async function processAllPDFs() {

  await fs.mkdir(outputFolder, { recursive: true });

  const files = (await fs.readdir(inputFolder))
    .filter(f => f.toLowerCase().endsWith(".pdf"));

  for (const file of files) {

    const inputPath = path.join(inputFolder, file);
    const outputPath = path.join(outputFolder, "clean_" + file);

    await removeWatermarkObjects(inputPath, outputPath);

    console.log("Processed:", file);

  }

}

processAllPDFs().catch(console.error);
