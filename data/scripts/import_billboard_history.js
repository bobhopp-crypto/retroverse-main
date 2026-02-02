#!/usr/bin/env node
/**
 * Import Billboard Hot 100 History
 * 
 * Loads CSV files containing weekly Hot 100 positions and populates
 * the full_hot100_history field for songs in the database.
 * 
 * Usage:
 *   node import_billboard_history.js <csv_file_path>
 * 
 * CSV Format (expected):
 *   week,work_id,position,title,artist
 *   1984-02-11,12345,20,Thriller,Michael Jackson
 * 
 * Matching Strategy:
 *   1. Match by work_id (exact)
 *   2. Fuzzy match by title + artist (normalized)
 * 
 * Output:
 *   Updates hot100_song_trajectories.json with full_hot100_history field
 */

const fs = require('fs');
const path = require('path');

// Configuration
const TRAJECTORIES_FILE = path.join(__dirname, '../../retroverse-site/public/data/hot100_song_trajectories.json');
const OUTPUT_FILE = TRAJECTORIES_FILE; // Update in place

/**
 * Normalize a string for fuzzy matching
 * @param {string} str - String to normalize
 * @returns {string} Normalized string
 */
function normalizeKey(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')    // Collapse whitespace
    .trim();
}

/**
 * Parse CSV file
 * @param {string} csvPath - Path to CSV file
 * @returns {Array} Array of parsed rows
 */
function parseCSV(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }
  
  // Parse header
  const headers = lines[0].split(',').map(h => h.trim());
  const requiredHeaders = ['week', 'position'];
  const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
  
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required headers: ${missingHeaders.join(', ')}`);
  }
  
  // Parse rows
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || null;
    });
    
    // Validate required fields
    if (row.week && row.position !== null && row.position !== undefined) {
      rows.push(row);
    }
  }
  
  return rows;
}

/**
 * Match CSV row to song in trajectories
 * @param {Object} csvRow - CSV row with week, position, work_id, title, artist
 * @param {Array} songs - Array of song objects from trajectories
 * @returns {Object|null} Matched song object or null
 */
function matchSong(csvRow, songs) {
  // Strategy 1: Match by work_id (exact)
  if (csvRow.work_id) {
    const match = songs.find(s => s.work_id === csvRow.work_id);
    if (match) return match;
  }
  
  // Strategy 2: Fuzzy match by title + artist
  if (csvRow.title && csvRow.artist) {
    const csvKey = normalizeKey(`${csvRow.artist} - ${csvRow.title}`);
    const match = songs.find(s => {
      const songKey = normalizeKey(`${s.artist || ''} - ${s.title || ''}`);
      return songKey === csvKey;
    });
    if (match) return match;
  }
  
  return null;
}

/**
 * Main import function
 * @param {string} csvPath - Path to CSV file
 */
function importHistory(csvPath) {
  console.log('Loading trajectories...');
  const trajectories = JSON.parse(fs.readFileSync(TRAJECTORIES_FILE, 'utf-8'));
  console.log(`  Loaded ${trajectories.length} songs`);
  
  console.log(`\nParsing CSV: ${csvPath}`);
  const csvRows = parseCSV(csvPath);
  console.log(`  Found ${csvRows.length} rows`);
  
  // Group CSV rows by song (work_id or title+artist)
  const csvBySong = new Map();
  for (const row of csvRows) {
    const key = row.work_id || `${normalizeKey(row.artist || '')} - ${normalizeKey(row.title || '')}`;
    if (!csvBySong.has(key)) {
      csvBySong.set(key, []);
    }
    csvBySong.get(key).push({
      week: row.week,
      position: row.position === '' || row.position === null ? null : parseInt(row.position, 10)
    });
  }
  
  console.log(`  Grouped into ${csvBySong.size} unique songs`);
  
  // Match and update songs
  let matched = 0;
  let updated = 0;
  
  for (const [key, positions] of csvBySong.entries()) {
    // Find matching song
    const song = trajectories.find(s => {
      if (key === s.work_id?.toString()) return true;
      const songKey = normalizeKey(`${s.artist || ''} - ${s.title || ''}`);
      return songKey === key;
    });
    
    if (song) {
      matched++;
      
      // Sort positions by week
      const sorted = positions.sort((a, b) => a.week.localeCompare(b.week));
      
      // Update full_hot100_history
      song.full_hot100_history = sorted;
      updated++;
    }
  }
  
  console.log(`\nMatched: ${matched} songs`);
  console.log(`Updated: ${updated} songs`);
  
  // Write updated trajectories
  console.log(`\nWriting updated trajectories to ${OUTPUT_FILE}...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(trajectories, null, 2), 'utf-8');
  console.log('Done!');
}

// CLI
if (require.main === module) {
  const csvPath = process.argv[2];
  
  if (!csvPath) {
    console.error('Usage: node import_billboard_history.js <csv_file_path>');
    process.exit(1);
  }
  
  if (!fs.existsSync(csvPath)) {
    console.error(`Error: CSV file not found: ${csvPath}`);
    process.exit(1);
  }
  
  try {
    importHistory(csvPath);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

module.exports = { importHistory, parseCSV, matchSong, normalizeKey };
