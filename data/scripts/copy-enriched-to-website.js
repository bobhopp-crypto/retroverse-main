/**
 * copy-enriched-to-website.js
 *
 * Phase 3: Website Data Wiring
 *
 * Copies enriched JSON from:
 *   output/reports/VideoFiles.enriched.json
 *
 * To website:
 *   /Users/bobhopp/Sites/retroverse-design/public/data/VideoFiles.json
 *
 * This is the file the website fetches.
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------
const BASE_DIR = path.join(__dirname, "..");
const ENRICHED_SOURCE = path.join(BASE_DIR, "output", "reports", "VideoFiles.enriched.json");
const WEBSITE_DEST = path.resolve(
  "/Users/bobhopp/Sites/retroverse-design/public/data/VideoFiles.json"
);

// ---------------------------------------------------------
// MAIN
// ---------------------------------------------------------
function main() {
  // Verify source exists
  if (!fs.existsSync(ENRICHED_SOURCE)) {
    console.error(`❌ Enriched JSON not found: ${ENRICHED_SOURCE}`);
    console.error(`   Run extract-firstseen.js first.`);
    process.exit(1);
  }

  // Verify destination directory exists
  const destDir = path.dirname(WEBSITE_DEST);
  if (!fs.existsSync(destDir)) {
    console.error(`❌ Website data directory not found: ${destDir}`);
    process.exit(1);
  }

  // Copy file
  fs.copyFileSync(ENRICHED_SOURCE, WEBSITE_DEST);

  // Verify copy succeeded
  const sourceStats = fs.statSync(ENRICHED_SOURCE);
  const destStats = fs.statSync(WEBSITE_DEST);

  console.log(`✅ Copied enriched JSON to website`);
  console.log(`   Source: ${ENRICHED_SOURCE}`);
  console.log(`   Dest:   ${WEBSITE_DEST}`);
  console.log(`   Size:   ${(destStats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`\n➡️  Website will now use enriched data with DaysSinceAdded`);
}

main();
