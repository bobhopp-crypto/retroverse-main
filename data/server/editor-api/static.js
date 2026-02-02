import express from "express";
import path from "path";
import { fileURLToPath } from "url";

console.log("Starting Editor UI server...");

const app = express();
const PORT = 8080;

// Resolve paths safely (ESM-compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// retroverse-design lives here:
const STATIC_ROOT = path.resolve(__dirname, "../../retroverse-design");

app.use(express.static(STATIC_ROOT));

app.get("/", (_req, res) => {
  res.redirect("/editor.html");
});

app.listen(PORT, () => {
  console.log(`Editor UI running at http://localhost:${PORT}/editor.html`);
});

