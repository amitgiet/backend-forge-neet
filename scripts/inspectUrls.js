const mongoose = require('mongoose');
require('dotenv').config();

async function inspectUrls() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  const report = {};

  for (const c of collections) {
    const col = db.collection(c.name);
    // Let's sample 100 documents or stream
    const cursor = col.find({});
    let count = 0;
    const driveUrls = new Set();
    const otherUrls = new Set();

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      count++;
      if (count > 200 && driveUrls.size === 0) break; // if first 200 have no urls, skip heavy scanning
      if (count > 1000) break;

      const str = JSON.stringify(doc);
      if (!str.includes('http')) continue;

      const matches = str.match(/https?:\/\/[^"\s,\\]+/g) || [];
      for (const url of matches) {
        if (/drive\.google|googleusercontent/i.test(url)) {
          driveUrls.add(url);
        } else {
          try {
            const host = new URL(url).hostname;
            otherUrls.add(host);
          } catch (e) {}
        }
      }
    }

    if (driveUrls.size > 0 || otherUrls.size > 0) {
      report[c.name] = {
        scanned: count,
        driveUrlCount: driveUrls.size,
        sampleDriveUrls: Array.from(driveUrls).slice(0, 3),
        otherHosts: Array.from(otherUrls).slice(0, 5)
      };
    }
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

inspectUrls().catch(err => {
  console.error(err);
  process.exit(1);
});
