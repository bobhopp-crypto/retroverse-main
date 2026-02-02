import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ================= CONFIG ================= */

const ROOT = path.resolve(__dirname, "../..");

const CURATED_MATCHES =
  path.join(ROOT, "output/reports/video_billboard_matches.curated.json");

const ARTIST_GENRES =
  path.join(ROOT, "output/reports/artist_genres.json");

const CANDIDATES_CSV =
  path.join(ROOT, "output/reports/video_billboard_match_candidates.csv");

const VDJ_DB_XML =
  path.join(
    process.env.HOME,
    "Library/Application Support/VirtualDJ/database.xml"
  );

const PORT = 3001;

/* ================= HELPERS ================= */

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}

function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

/* ================= APP ================= */

const app = express();
app.use(cors());
app.use(express.json());

/* ---------- MATCH: NEXT ---------- */

app.get("/api/match/next", (req, res) => {
  const curated = readJson(CURATED_MATCHES, []);
  const curatedIds = new Set(curated.map(r => String(r.video_id)));

  const csvText = fs.readFileSync(CANDIDATES_CSV, "utf-8");
  const rows = parse(csvText, { columns: true, skip_empty_lines: true });

  const grouped = {};
  for (const r of rows) {
    if (curatedIds.has(String(r.video_id))) continue;
    grouped[r.video_id] ??= [];
    grouped[r.video_id].push(r);
  }

  const videoId = Object.keys(grouped)[0];
  if (!videoId) {
    return res.json({ video: null, candidates: [] });
  }

  res.json({
    video_id: videoId,
    candidates: grouped[videoId]
  });
});

/* ---------- MATCH: DECISION ---------- */

app.post("/api/match/decision", (req, res) => {
  const curated = readJson(CURATED_MATCHES, []);
  curated.push({
    ...req.body,
    decided_at: new Date().toISOString()
  });
  atomicWrite(CURATED_MATCHES, curated);
  console.log("Updated curated matches:", req.body.video_id);
  res.json({ ok: true });
});

/* ---------- ARTISTS ---------- */

app.get("/api/artists", (_req, res) => {
  const genres = readJson(ARTIST_GENRES, {});
  res.json(
    Object.entries(genres).map(([artist_norm, genre]) => ({
      artist_norm,
      genre
    }))
  );
});

/* ---------- ARTIST GENRE SAVE ---------- */

app.post("/api/artists/genre", (req, res) => {
  const { artist_norm, genre } = req.body;
  const genres = readJson(ARTIST_GENRES, {});
  genres[artist_norm] = genre.trim();
  atomicWrite(ARTIST_GENRES, genres);
  console.log(`Updated artist genre: ${artist_norm} -> ${genre}`);
  res.json({ ok: true });
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log(`Editor API listening on port ${PORT}`);
});
