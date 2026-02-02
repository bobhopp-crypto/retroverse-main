/**
 * extract-firstseen.js
 *
 * Reads:
 *   snapshots/latest/database.xml
 *   snapshots/latest/VideoFiles.json
 *
 * Writes:
 *   output/reports/VideoFiles.enriched.json
 *
 * Adds:
 *   FirstSeenUnix
 *   DaysSinceAdded
 */

const fs = require("fs");
const path = require("path");
const xml2js = require("xml2js");

const SNAPSHOT_DIR = path.join(__dirname, "..", "snapshots", "latest");
const OUTPUT_DIR = path.join(__dirname, "..", "output", "reports");

const XML_PATH = path.join(SNAPSHOT_DIR, "database.xml");
const JSON_PATH = path.join(SNAPSHOT_DIR, "VideoFiles.json");
const OUT_PATH = path.join(OUTPUT_DIR, "VideoFiles.enriched.json");

function filenameOnly(p) {
  return path.basename(p || "").toLowerCase();
}

(async function run() {
  if (!fs.existsSync(XML_PATH) || !fs.existsSync(JSON_PATH)) {
    console.error("❌ Missing snapshot inputs");
    process.exit(1);
  }

  const xml = fs.readFileSync(XML_PATH, "utf8");
  const json = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));

  const parser = new xml2js.Parser({ explicitArray: false });
  const parsed = await parser.parseStringPromise(xml);

  // Build lookup: filename → FirstSeen
  const firstSeenByFile = {};

  const songs = parsed.VirtualDJ_Database?.Song || [];
  const songArray = Array.isArray(songs) ? songs : [songs];

  for (const song of songArray) {
    const file = filenameOnly(song.$?.FilePath);
    const infos = song.Infos?.$;
    if (file && infos?.FirstSeen) {
      firstSeenByFile[file] = Number(infos.FirstSeen);
    }
  }

  const nowSec = Math.floor(Date.now() / 1000);

  let attached = 0;
  let missing = 0;

  const enriched = json.map(entry => {
    const file = filenameOnly(entry.FilePath);
    const firstSeen = firstSeenByFile[file];

    if (firstSeen) {
      attached++;
      const days = Math.floor((nowSec - firstSeen) / 86400);
      return {
        ...entry,
        FirstSeenUnix: firstSeen,
        DaysSinceAdded: days
      };
    } else {
      missing++;
      return entry;
    }
  });

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(enriched, null, 2));

  console.log("✅ FirstSeen extraction complete");
  console.log(`   Attached: ${attached}`);
  console.log(`   Missing:  ${missing}`);
  console.log(`   Output:   ${OUT_PATH}`);
})();
