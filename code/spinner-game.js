import fs from "fs";
import { createPlaybackBridge } from "./playback-bridge.js";

// Load config to find VideoFiles.json
const config = JSON.parse(
  fs.readFileSync(new URL("./retroverse-config.json", import.meta.url), "utf8")
);

const { vdjVideoFilesPath } = config;

if (!vdjVideoFilesPath) {
  console.error("vdjVideoFilesPath missing from retroverse-config.json");
  process.exit(1);
}

// Load video data
const videos = JSON.parse(fs.readFileSync(vdjVideoFilesPath, "utf8"));

if (!Array.isArray(videos) || videos.length === 0) {
  console.error("VideoFiles.json is empty or invalid");
  process.exit(1);
}

// Pick a random entry
const pick = videos[Math.floor(Math.random() * videos.length)];

if (!pick.FilePath) {
  console.error("Random pick missing FilePath");
  process.exit(1);
}

// Resolve playable URL
const bridge = createPlaybackBridge();
const { url } = bridge.getPlayable(pick.FilePath);

// Output result
console.log("🎰 RetroVerse Wayback Spinner");
console.log("-----------------------------");
console.log("Artist:", pick.Artist || "Unknown");
console.log("Title :", pick.Title || "Unknown");
console.log("Year  :", pick.Year || "Unknown");
console.log("URL   :", url);
