import { pickWheelPuzzle } from "../retroverse-shared/wheel-video-picker.js";
import { createPlaybackBridge } from "../retroverse-shared/playback-bridge.js";

const puzzleEl = document.getElementById("puzzle");
const categoryEl = document.getElementById("category");
const statusEl = document.getElementById("status");
const playBtn = document.getElementById("playBtn");

const bridge = createPlaybackBridge();
const puzzle = pickWheelPuzzle();

let solution = puzzle.solution.toUpperCase();
let masked = puzzle.puzzle.toUpperCase();
let guessed = new Set();
let wrong = 0;
const MAX_WRONG = 6;

categoryEl.textContent =
  `Category: ${puzzle.type.toUpperCase()} (${puzzle.year})`;

render();

document.addEventListener("keydown", (e) => {
  const letter = e.key.toUpperCase();
  if (!letter.match(/[A-Z]/)) return;
  if (guessed.has(letter)) return;
  if (playBtn.hidden === false) return;

  guessed.add(letter);

  if (solution.includes(letter)) {
    reveal(letter);
  } else {
    wrong++;
  }

  render();
  checkEnd();
});

function reveal(letter) {
  let out = "";
  for (let i = 0; i < solution.length; i++) {
    if (solution[i] === letter) {
      out += letter;
    } else {
      out += masked[i];
    }
  }
  masked = out;
}

function render() {
  puzzleEl.textContent = masked;
  statusEl.textContent =
    `Wrong guesses: ${wrong} / ${MAX_WRONG}`;
}

function checkEnd() {
  if (!masked.includes("_")) {
    statusEl.textContent = "🎉 You solved it!";
    showPlay();
  } else if (wrong >= MAX_WRONG) {
    statusEl.textContent = "❌ Out of guesses";
    masked = solution;
    render();
    showPlay();
  }
}

function showPlay() {
  const { url } = bridge.getPlayable(puzzle.filePath);
  playBtn.hidden = false;
  playBtn.onclick = () => window.open(url, "_blank");
}
