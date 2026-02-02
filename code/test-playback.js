import { createPlaybackBridge } from "./playback-bridge.js";

const bridge = createPlaybackBridge();

const result = bridge.getPlayable(
  "/Users/bobhopp/Library/CloudStorage/Dropbox/VIDEO/2000's/Missy Elliott - Get Ur Freak On.mp4"
);

console.log(result);
