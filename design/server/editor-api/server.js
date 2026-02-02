/**
 * Editor API server (port 3001).
 * GET /api/artists: artists from VirtualDJ database.xml + genres from output/reports/artist_genres.json.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PORT = 3001;

const VDJ_DATABASE = path.join(os.homedir(), 'Library', 'Application Support', 'VirtualDJ', 'database.xml');
const ARTIST_GENRES_PATH = path.join(process.cwd(), 'output', 'reports', 'artist_genres.json');
const VIDEO_BILLBOARD_CURATED_PATH = path.join(process.cwd(), 'output', 'reports', 'video_billboard_matches.curated.json');
const VIDEO_ROOT = '/Users/bobhopp/Library/CloudStorage/Dropbox/VIDEO/';

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function sendCors(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

/**
 * Extract unique artists from VirtualDJ database.xml only.
 * For each <Song> where FilePath ends in .mp4: artist from <Artist> else <Author> else <Composer>; ignore empty.
 * artist_norm = artist.toLowerCase().trim(); unique by artist_norm, artist_display = first seen.
 */
function getArtistsFromVdjXml() {
  const xml = fs.readFileSync(VDJ_DATABASE, 'utf8');
  const byNorm = new Map();
  const songRegex = /<Song[^>]*>([\s\S]*?)<\/Song>/gi;
  const filePathRegex = /<FilePath[^>]*>([^<]*)<\/FilePath>/i;
  const artistTagRegex = /<Artist[^>]*>([^<]*)<\/Artist>/i;
  const authorTagRegex = /<Author[^>]*>([^<]*)<\/Author>/i;
  const composerTagRegex = /<Composer[^>]*>([^<]*)<\/Composer>/i;
  let m;
  while ((m = songRegex.exec(xml)) !== null) {
    const block = m[1];
    const pathMatch = block.match(filePathRegex);
    const filePath = (pathMatch && pathMatch[1] || '').trim();
    if (!filePath.toLowerCase().endsWith('.mp4')) continue;
    const artistMatch = block.match(artistTagRegex);
    const authorMatch = block.match(authorTagRegex);
    const composerMatch = block.match(composerTagRegex);
    const raw = (artistMatch && artistMatch[1]) || (authorMatch && authorMatch[1]) || (composerMatch && composerMatch[1]) || '';
    const display = raw.trim();
    if (!display) continue;
    const norm = display.toLowerCase().trim();
    if (!byNorm.has(norm)) byNorm.set(norm, display);
  }
  return Array.from(byNorm.entries()).map(([artist_norm, artist_display]) => ({
    artist_norm,
    artist_display,
  }));
}

/**
 * Stable video_id from artist + title (e.g. "38_SPECIAL__CAUGHT_UP_IN_YOU").
 */
function slug(artist, title) {
  const a = (artist || '').trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
  const t = (title || '').trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
  return `${a}__${t}`;
}

/**
 * Load video list from VirtualDJ database.xml (mp4 only).
 * Returns [{ video_id, artist, title, year }], deduped by video_id.
 */
function loadVideosFromVDJ() {
  const xml = fs.readFileSync(VDJ_DATABASE, 'utf8');
  const songRegex = /<Song[^>]*>([\s\S]*?)<\/Song>/gi;
  const filePathRegex = /<FilePath[^>]*>([^<]*)<\/FilePath>/i;
  const artistTagRegex = /<Artist[^>]*>([^<]*)<\/Artist>/i;
  const authorTagRegex = /<Author[^>]*>([^<]*)<\/Author>/i;
  const composerTagRegex = /<Composer[^>]*>([^<]*)<\/Composer>/i;
  const titleTagRegex = /<Title[^>]*>([^<]*)<\/Title>/i;
  const yearTagRegex = /<Year[^>]*>([^<]*)<\/Year>/i;
  const byVideoId = new Map();
  let m;
  while ((m = songRegex.exec(xml)) !== null) {
    const block = m[1];
    const pathMatch = block.match(filePathRegex);
    const filePath = (pathMatch && pathMatch[1] || '').trim();
    const valid = filePath.endsWith('.mp4') && filePath.startsWith(VIDEO_ROOT);
    if (!valid) {
      console.log("VDJ VIDEO:", filePath);
      continue;
    }
    const artistMatch = block.match(artistTagRegex);
    const authorMatch = block.match(authorTagRegex);
    const composerMatch = block.match(composerTagRegex);
    const artistRaw = (artistMatch && artistMatch[1]) || (authorMatch && authorMatch[1]) || (composerMatch && composerMatch[1]) || '';
    const artist = artistRaw.trim();
    const titleMatch = block.match(titleTagRegex);
    const title = (titleMatch && titleMatch[1] || '').trim();
    const yearMatch = block.match(yearTagRegex);
    const yearRaw = (yearMatch && yearMatch[1] || '').trim();
    const year = yearRaw ? parseInt(yearRaw, 10) : undefined;
    const videoId = slug(artist, title);
    if (!videoId || videoId === '__') continue;
    if (!byVideoId.has(videoId)) byVideoId.set(videoId, { video_id: videoId, artist, title, year });
  }
  return Array.from(byVideoId.values());
}

/**
 * Load curated match set from output/reports/video_billboard_matches.curated.json.
 * Returns Set of video_id (matched).
 */
function loadCuratedMatches() {
  try {
    const raw = fs.readFileSync(VIDEO_BILLBOARD_CURATED_PATH, 'utf8');
    const data = JSON.parse(raw);
    const ids = Array.isArray(data) ? data : (data.video_ids || []);
    const set = new Set();
    for (const item of ids) {
      const id = typeof item === 'object' && item != null && 'video_id' in item ? item.video_id : item;
      if (id != null && String(id).trim()) set.add(String(id).trim());
    }
    return set;
  } catch (e) {
    if (e.code === 'ENOENT') return new Set();
    throw e;
  }
}

/**
 * Load genre map from output/reports/artist_genres.json.
 * Supports: { "artist_norm": "genre" } or [ { "artist_norm": "...", "genre": "..." } ].
 */
function loadArtistGenres() {
  try {
    const raw = fs.readFileSync(ARTIST_GENRES_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      const map = new Map();
      for (const row of data) {
        const n = (row.artist_norm || '').trim().toLowerCase();
        if (n) map.set(n, (row.genre != null ? String(row.genre) : '').trim());
      }
      return map;
    }
    if (data && typeof data === 'object') {
      const map = new Map();
      for (const [k, v] of Object.entries(data)) {
        const n = (k || '').trim().toLowerCase();
        if (n) map.set(n, (v != null ? String(v) : '').trim());
      }
      return map;
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('artist_genres.json not loaded:', e.message);
  }
  return new Map();
}

/**
 * GET /api/artists
 * VirtualDJ database.xml only. Extract artists (FilePath ends .mp4; Artist else Author else Composer).
 * Merge genres from output/reports/artist_genres.json; sort by artist_display.
 * If XML exists but yields zero artists: return error.
 */
function handleGetArtists(res) {
  try {
    let artists;
    try {
      artists = getArtistsFromVdjXml();
    } catch (e) {
      if (e.code === 'ENOENT') {
        sendCors(res, 404, { error: 'VirtualDJ database.xml not found' });
        return;
      }
      throw e;
    }
    if (artists.length === 0) {
      sendCors(res, 400, { error: 'No artists found in VirtualDJ database.xml' });
      return;
    }
    const genreMap = loadArtistGenres();
    const merged = artists.map((a) => ({
      artist_norm: a.artist_norm,
      artist_display: a.artist_display,
      genre: genreMap.has(a.artist_norm) ? genreMap.get(a.artist_norm) : '',
    }));
    merged.sort((a, b) => (a.artist_display || '').localeCompare(b.artist_display || '', 'en'));
    sendCors(res, 200, merged);
  } catch (err) {
    console.error('GET /api/artists error:', err);
    sendCors(res, 500, { error: err.message });
  }
}

/**
 * POST /api/artists/genre — persist genre for artist_norm to output/reports/artist_genres.json.
 */
function handlePostArtistGenre(req, res) {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    try {
      const { artist_norm, genre } = JSON.parse(body || '{}');
      const norm = (artist_norm != null ? String(artist_norm) : '').trim().toLowerCase();
      const genreStr = (genre != null ? String(genre) : '').trim();
      if (!norm) {
        sendCors(res, 400, { error: 'artist_norm required' });
        return;
      }
      const dir = path.dirname(ARTIST_GENRES_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const existing = loadArtistGenres();
      existing.set(norm, genreStr);
      const arr = Array.from(existing.entries()).map(([k, v]) => ({ artist_norm: k, genre: v }));
      arr.sort((a, b) => a.artist_norm.localeCompare(b.artist_norm, 'en'));
      fs.writeFileSync(ARTIST_GENRES_PATH, JSON.stringify(arr, null, 2), 'utf8');
      sendCors(res, 200, { ok: true });
    } catch (err) {
      console.error('POST /api/artists/genre error:', err);
      sendCors(res, 500, { error: err.message });
    }
  });
}

/**
 * GET /api/match/next
 * Matched = video_id in video_billboard_matches.curated.json.
 * Unmatched = in VDJ video list and NOT in curated. Return first unmatched or { video: null }.
 */
function handleMatchNext(res) {
  try {
    const videos = loadVideosFromVDJ();
    const curated = loadCuratedMatches();
    const unmatched = videos.filter((v) => !curated.has(v.video_id));
    if (unmatched.length === 0) {
      sendCors(res, 200, { video: null });
      return;
    }
    const first = unmatched[0];
    sendCors(res, 200, {
      video_id: first.video_id,
      video: {
        artist: first.artist,
        title: first.title,
        year: first.year,
      },
      candidates: [],
    });
  } catch (err) {
    console.error('GET /api/match/next error:', err);
    sendCors(res, 500, { error: err.message });
  }
}

function handleMatchDecision(req, res) {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    sendCors(res, 200, { ok: true });
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    sendCors(res, 204, '');
    return;
  }

  const url = req.url?.split('?')[0];
  if (req.method === 'GET' && url === '/api/artists') {
    handleGetArtists(res);
    return;
  }
  if (req.method === 'POST' && url === '/api/artists/genre') {
    handlePostArtistGenre(req, res);
    return;
  }
  if (req.method === 'GET' && url === '/api/match/next') {
    handleMatchNext(res);
    return;
  }
  if (req.method === 'POST' && url === '/api/match/decision') {
    handleMatchDecision(req, res);
    return;
  }

  sendCors(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Editor API listening on http://localhost:${PORT}`);
});
