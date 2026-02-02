import { createPlaybackBridge } from "./playback-bridge.js";

export function playGame(filePath) {
  const bridge = createPlaybackBridge();
  const { url } = bridge.getPlayable(filePath);
  return url;
}

// Temporary manual test when run directly
if (process.argv[1].endsWith("game-play.js")) {
  const testPath = process.argv[2];

  if (!testPath) {
    console.error("Usage: node game-play.js <VDJ FilePath>");
    process.exit(1);
  }

  try {
    const url = playGame(testPath);
    console.log(url);
  } catch (err) {
    console.error("ERROR:", err.message);
    process.exit(1);
  }
}
