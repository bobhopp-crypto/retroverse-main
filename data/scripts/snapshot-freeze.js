/**
 * snapshot-freeze.js
 *
 * Phase 1: Snapshot Freeze
 *
 * Creates timestamped snapshot folder
 * Copies:
 *   - VirtualDJ database.xml
 *   - Current VideoFiles.json (from website public/data/)
 *
 * Updates snapshots/latest symlink
 *
 * No overwrites allowed - exits if snapshot folder already exists
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------
const BASE_DIR = path.join(__dirname, "..");
const SNAPSHOTS_DIR = path.join(BASE_DIR, "snapshots");
const VDJ_XML_SOURCE = "/Users/bobhopp/Library/Application Support/VirtualDJ/database.xml";
const VDJ_JSON_SOURCE = path.resolve(
  '/Users/bobhopp/Sites/retroverse-design/public/data/VideoFiles.json'
);

// ---------------------------------------------------------
// MAIN
// ---------------------------------------------------------
function main() {
  // Generate timestamp: YYYY-MM-DD_HH-MM
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  const snapshotDir = path.join(SNAPSHOTS_DIR, timestamp);
  const latestLink = path.join(SNAPSHOTS_DIR, "latest");

  // Check if snapshot already exists (no overwrites)
  if (fs.existsSync(snapshotDir)) {
    console.error(`❌ Snapshot already exists: ${timestamp}`);
    console.error(`   Refusing to overwrite.`);
    process.exit(1);
  }

  // Verify source files exist
  if (!fs.existsSync(VDJ_XML_SOURCE)) {
    console.error(`❌ VirtualDJ database.xml not found: ${VDJ_XML_SOURCE}`);
    process.exit(1);
  }

  if (!fs.existsSync(VDJ_JSON_SOURCE)) {
    console.error(`❌ VideoFiles.json not found: ${VDJ_JSON_SOURCE}`);
    console.error(`   Ensure website data file exists.`);
    process.exit(1);
  }

  // Create snapshot directory
  fs.mkdirSync(snapshotDir, { recursive: true });

  // Copy files
  const xmlDest = path.join(snapshotDir, "database.xml");
  const jsonDest = path.join(snapshotDir, "VideoFiles.json");

  console.log(`📸 Creating snapshot: ${timestamp}`);
  fs.copyFileSync(VDJ_XML_SOURCE, xmlDest);
  console.log(`   ✅ Copied database.xml`);

  fs.copyFileSync(VDJ_JSON_SOURCE, jsonDest);
  console.log(`   ✅ Copied VideoFiles.json`);

  // Update latest symlink
  if (fs.existsSync(latestLink)) {
    fs.unlinkSync(latestLink);
  }
  fs.symlinkSync(timestamp, latestLink);
  console.log(`   ✅ Updated snapshots/latest -> ${timestamp}`);

  console.log(`\n✅ Snapshot freeze complete`);
  console.log(`   Location: ${snapshotDir}`);
  console.log(`\n➡️  Next: Run extract-firstseen.js`);
}

main();
