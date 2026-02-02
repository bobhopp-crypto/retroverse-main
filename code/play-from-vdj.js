import { createPlaybackBridge } from "./playback-bridge.js";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: node play-from-vdj.js <VDJ FilePath>");
  process.exit(1);
}

const bridge = createPlaybackBridge();

try {
  const { url } = bridge.getPlayable(filePath);
  console.log(url);
} catch (err) {
  console.error("ERROR:", err.message);
  process.exit(1);
}
