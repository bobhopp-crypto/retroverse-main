const fs = require("fs");
const path = require("path");

const SNAPSHOT = path.join(__dirname, "snapshots/latest/VideoFiles.json");
const OUTPUT_ROOT = path.join(__dirname, "output/thumbnails");
const REPORT_PATH = path.join(__dirname, "output/reports/thumbnails-report.json");
const PLACEHOLDER = path.join(__dirname, "thumbnail-blank.png");
const CUE8_JSON = path.resolve("exports/vdj/VideoFiles.json");

let cue8Lookup = {};
if (fs.existsSync(CUE8_JSON)) {
  const records = JSON.parse(fs.readFileSync(CUE8_JSON, "utf8"));
  for (const r of records) {
    if (r.FilePath && r.Cue8Timestamp != null) {
      cue8Lookup[r.FilePath] = r.Cue8Timestamp;
    }
  }
}

// --- helpers ---
function normalizeName(str) {
  return str
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9._ -]/g, "")
    .replace(/\s+/g, "_")
    .trim();
}

function thumbPathFromFilePath(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  return path.join(dir, normalizeName(base) + ".jpg");
}

// --- load snapshot ---
const videos = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));

const report = {
  snapshot: "latest",
  totalVideos: videos.length,
  generated: [],
  skipped_existing: [],
  missing_source: [],
  errors: []
};

for (const v of videos) {
  try {
    if (!v.FilePath) {
      report.missing_source.push(v);
      continue;
    }

    const relThumb = thumbPathFromFilePath(v.FilePath);
    const outThumb = path.join(OUTPUT_ROOT, relThumb);
    const videoPath = v.FilePath;
    const cue8Ms = cue8Lookup[videoPath];

    fs.mkdirSync(path.dirname(outThumb), { recursive: true });

    if (!cue8Ms && fs.existsSync(outThumb)) {
      report.skipped_existing.push(relThumb);
      continue;
    }

    if (!fs.existsSync(PLACEHOLDER)) {
      throw new Error("thumbnail-blank.png not found");
    }

    fs.copyFileSync(PLACEHOLDER, outThumb);
    report.generated.push(relThumb);

  } catch (err) {
    report.errors.push({
      file: v.FilePath,
      error: err.message
    });
  }
}

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

console.log("Thumbnail generation complete");
console.log("Total videos:", report.totalVideos);
console.log("Generated:", report.generated.length);
console.log("Skipped existing:", report.skipped_existing.length);
console.log("Errors:", report.errors.length);

