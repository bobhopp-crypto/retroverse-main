# RetroVerse Shared

## Playback Bridge

Use this when you need a playable video URL from a VirtualDJ file path.

### Usage

```js
import { createPlaybackBridge } from "./playback-bridge.js";

const bridge = createPlaybackBridge();

const { url } = bridge.getPlayable(
  "/Users/bobhopp/Library/CloudStorage/Dropbox/VIDEO/2000's/Missy Elliott - Get Ur Freak On.mp4"
);
