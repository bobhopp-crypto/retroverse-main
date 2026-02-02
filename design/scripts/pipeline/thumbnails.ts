/**
 * Thumbnail Generation Pipeline — v1 (LOCKED)
 * 
 * Core Rules (LOCKED v1):
 * - Source of truth: Use snapshots/latest/ only
 * - Never read live files directly
 * - VirtualDJ is assumed closed before pipeline runs
 * - Cue 8 priority: If Cue 8 exists, generate thumbnail from Cue 8 and overwrite existing
 * - No cue fallback: If Cue 8 does not exist, do not overwrite existing thumbnails
 * - Every decision must be logged
 * 
 * Cue-8 overwrite behavior is intentional and locked for v1.
 * VirtualDJ must be closed before execution.
 * Snapshots guarantee a frozen source state.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, lstatSync } from 'fs'
import { join, dirname, basename, extname } from 'path'
import { parseStringPromise } from 'xml2js'
import { execSync } from 'child_process'

// Canonical roles (LOCKED v1)
// retroverse-data = DATA AUTHORITY
// retroverse-design = READ-ONLY CONSUMER
const DATA_REPO = process.env.RETROVERSE_DATA_REPO || join(process.env.HOME || '', 'Sites', 'retroverse-data')
const DESIGN_REPO = process.cwd()

// Paths
const SNAPSHOTS_DIR = join(DESIGN_REPO, 'snapshots')
const SNAPSHOTS_LATEST = join(SNAPSHOTS_DIR, 'latest')
const DATABASE_XML = join(SNAPSHOTS_LATEST, 'database.xml')
const VIDEOFILES_JSON = join(SNAPSHOTS_LATEST, 'VideoFiles.json')
const OUTPUT_THUMBNAILS_DIR = join(DESIGN_REPO, 'output', 'thumbnails')
const OUTPUT_REPORTS_DIR = join(DESIGN_REPO, 'output', 'reports')
const PUBLIC_THUMBNAILS_DIR = join(DESIGN_REPO, 'public', 'thumbnails')

// Types
interface VideoFile {
  Title: string
  Artist: string
  FilePath: string
  SourcePath: string
  Decade?: string
  Grouping?: string
}

interface CuePoint {
  start: number // Time in seconds
  name?: string
}

interface ThumbnailAction {
  filePath: string
  action: 'generated_from_cue' | 'overwritten_from_cue' | 'skipped_existing' | 'missing_cue' | 'failed'
  cueTime?: number
  error?: string
  thumbnailPath?: string
}

interface ThumbnailReport {
  timestamp: string
  summary: {
    total: number
    generated_from_cue: number
    overwritten_from_cue: number
    skipped_existing: number
    missing_cue: number
    failed: number
  }
  actions: ThumbnailAction[]
}

/**
 * Ensure snapshots symlink exists (one-time setup)
 * Creates: retroverse-design/snapshots → retroverse-data/snapshots
 */
function ensureSnapshotsSymlink(): void {
  const dataSnapshotsDir = join(DATA_REPO, 'snapshots')
  
  if (existsSync(SNAPSHOTS_DIR)) {
    try {
      const stats = lstatSync(SNAPSHOTS_DIR)
      if (stats.isSymbolicLink()) {
        console.log(`✓ Symlink exists: ${SNAPSHOTS_DIR} → ${dataSnapshotsDir}`)
        return
      } else {
        console.error(`Error: ${SNAPSHOTS_DIR} exists but is not a symlink`)
        console.error('Please remove it and run again to create the symlink.')
        process.exit(1)
      }
    } catch (error: any) {
      console.error(`Error checking symlink: ${error.message}`)
      process.exit(1)
    }
  }

  // Create symlink
  if (!existsSync(dataSnapshotsDir)) {
    console.error(`Error: Data repository snapshots directory not found: ${dataSnapshotsDir}`)
    console.error('\nPlease ensure:')
    console.error('1. retroverse-data repository exists')
    console.error('2. RETROVERSE_DATA_REPO environment variable is set correctly')
    console.error(`   (Current: ${DATA_REPO})`)
    process.exit(1)
  }

  try {
    execSync(`ln -s "${dataSnapshotsDir}" "${SNAPSHOTS_DIR}"`, { stdio: 'pipe' })
    console.log(`✓ Created symlink: ${SNAPSHOTS_DIR} → ${dataSnapshotsDir}`)
  } catch (error: any) {
    console.error(`Error creating symlink: ${error.message}`)
    process.exit(1)
  }
}

/**
 * Parse VirtualDJ database.xml to extract Cue 8 information
 */
async function parseDatabaseXml(): Promise<Map<string, CuePoint>> {
  if (!existsSync(DATABASE_XML)) {
    console.error(`\n❌ ERROR: database.xml not found at ${DATABASE_XML}`)
    console.error('\nRequired snapshot files missing. Please run Phase 1 (Freeze) first:')
    console.error('  cd ~/Sites/retroverse-data')
    console.error('  node scripts/snapshot-freeze.js\n')
    process.exit(1)
  }

  const xmlContent = readFileSync(DATABASE_XML, 'utf-8')
  const parsed = await parseStringPromise(xmlContent)
  const cueMap = new Map<string, CuePoint>()

  // VirtualDJ database structure: Collection > Songs > Song
  // Each Song has CuePoints > CuePoint with index="8"
  try {
    const songs = parsed.Collection?.Songs?.[0]?.Song || []
    
    for (const song of songs) {
      const filePath = song.FileName?.[0]
      if (!filePath) continue

      const cuePoints = song.CuePoints?.[0]?.CuePoint || []
      const cue8 = cuePoints.find((cp: any) => cp.$.index === '8' || cp.$.Index === '8')
      
      if (cue8) {
        const start = parseFloat(cue8.$.Start || cue8.$.start || '0')
        if (start > 0) {
          cueMap.set(filePath, {
            start,
            name: cue8.$.Name || cue8.$.name
          })
        }
      }
    }
  } catch (error) {
    console.error('Error parsing database.xml:', error)
    throw error
  }

  console.log(`Parsed ${cueMap.size} Cue 8 entries from database.xml`)
  return cueMap
}

/**
 * Load VideoFiles.json from snapshot
 */
function loadVideoFiles(): VideoFile[] {
  if (!existsSync(VIDEOFILES_JSON)) {
    console.error(`\n❌ ERROR: VideoFiles.json not found at ${VIDEOFILES_JSON}`)
    console.error('\nRequired snapshot files missing. Please run Phase 1 (Freeze) first:')
    console.error('  cd ~/Sites/retroverse-data')
    console.error('  node scripts/snapshot-freeze.js\n')
    process.exit(1)
  }

  const content = readFileSync(VIDEOFILES_JSON, 'utf-8')
  return JSON.parse(content)
}

/**
 * Determine thumbnail output path based on FilePath
 * Mirrors website folder structure (decade/grouping)
 */
function getThumbnailPath(video: VideoFile, outputDir: string): string {
  // Extract folder structure from FilePath (e.g., "1960's/Artist - Title.mp4")
  const dir = dirname(video.FilePath)
  const baseName = basename(video.FilePath, extname(video.FilePath))
  const thumbnailFileName = `${baseName}.jpg`
  
  const thumbnailDir = join(outputDir, dir)
  const thumbnailPath = join(thumbnailDir, thumbnailFileName)
  
  return thumbnailPath
}

/**
 * Check if thumbnail already exists
 */
function thumbnailExists(thumbnailPath: string): boolean {
  return existsSync(thumbnailPath)
}

/**
 * Generate thumbnail using ffmpeg
 */
function generateThumbnail(
  sourceVideoPath: string,
  thumbnailPath: string,
  timeSeconds: number
): { success: boolean; error?: string } {
  try {
    // Ensure output directory exists
    mkdirSync(dirname(thumbnailPath), { recursive: true })

    // Use ffmpeg to extract frame at specified time
    // -ss: seek to time
    // -i: input file
    // -vframes 1: extract 1 frame
    // -q:v 2: high quality JPEG
    // -y: overwrite output file
    const command = `ffmpeg -ss ${timeSeconds} -i "${sourceVideoPath}" -vframes 1 -q:v 2 -y "${thumbnailPath}"`
    
    execSync(command, { 
      stdio: 'pipe',
      timeout: 30000 // 30 second timeout per video
    })

    return { success: true }
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message || String(error)
    }
  }
}

/**
 * Process a single video file
 */
function processVideo(
  video: VideoFile,
  cue8Map: Map<string, CuePoint>,
  outputDir: string
): ThumbnailAction {
  const thumbnailPath = getThumbnailPath(video, outputDir)
  const hasExisting = thumbnailExists(thumbnailPath)
  const cue8 = cue8Map.get(video.FilePath) || cue8Map.get(video.SourcePath)

  // Rule: If Cue 8 exists, generate/overwrite
  if (cue8) {
    const result = generateThumbnail(video.SourcePath, thumbnailPath, cue8.start)
    
    if (result.success) {
      return {
        filePath: video.FilePath,
        action: hasExisting ? 'overwritten_from_cue' : 'generated_from_cue',
        cueTime: cue8.start,
        thumbnailPath
      }
    } else {
      return {
        filePath: video.FilePath,
        action: 'failed',
        cueTime: cue8.start,
        error: result.error,
        thumbnailPath
      }
    }
  }

  // Rule: If Cue 8 does not exist, do not overwrite existing
  if (hasExisting) {
    return {
      filePath: video.FilePath,
      action: 'skipped_existing',
      thumbnailPath
    }
  }

  // No Cue 8 and no existing thumbnail
  return {
    filePath: video.FilePath,
    action: 'missing_cue',
    thumbnailPath
  }
}

/**
 * Copy thumbnails to public directory
 */
function copyToPublic(thumbnailPath: string): void {
  const relativePath = thumbnailPath.replace(OUTPUT_THUMBNAILS_DIR + '/', '')
  const publicPath = join(PUBLIC_THUMBNAILS_DIR, relativePath)
  
  mkdirSync(dirname(publicPath), { recursive: true })
  copyFileSync(thumbnailPath, publicPath)
}

/**
 * Main pipeline execution
 */
async function main() {
  console.log('=== Thumbnail Generation Pipeline (v1 LOCKED) ===\n')
  console.log('📁 REPOSITORY ROLES:')
  console.log(`   DATA AUTHORITY: ${DATA_REPO}`)
  console.log(`   READ-ONLY CONSUMER: ${DESIGN_REPO}\n`)
  
  // Ensure snapshots symlink exists
  console.log('🔗 Checking snapshots symlink...')
  ensureSnapshotsSymlink()
  
  console.log('\n📊 SOURCE PATHS:')
  console.log(`   database.xml: ${DATABASE_XML}`)
  console.log(`   VideoFiles.json: ${VIDEOFILES_JSON}`)
  console.log('\n📤 OUTPUT PATHS:')
  console.log(`   Thumbnails: ${OUTPUT_THUMBNAILS_DIR}`)
  console.log(`   Report: ${OUTPUT_REPORTS_DIR}/thumbnails.report.json`)
  console.log(`   Public: ${PUBLIC_THUMBNAILS_DIR}\n`)

  // Ensure output directories exist
  mkdirSync(OUTPUT_THUMBNAILS_DIR, { recursive: true })
  mkdirSync(OUTPUT_REPORTS_DIR, { recursive: true })
  mkdirSync(PUBLIC_THUMBNAILS_DIR, { recursive: true })

  // Load data
  console.log('📥 Loading data from snapshots...')
  const [cue8Map, videos] = await Promise.all([
    parseDatabaseXml(),
    Promise.resolve(loadVideoFiles())
  ])
  console.log(`   ✓ Loaded ${videos.length} videos`)
  console.log(`   ✓ Loaded ${cue8Map.size} Cue 8 entries\n`)

  // Process videos
  console.log('🎬 Processing thumbnails...')
  console.log('   Rules: Cue 8 overwrites | No Cue 8 preserves existing\n')
  const actions: ThumbnailAction[] = []
  
  for (const video of videos) {
    const action = processVideo(video, cue8Map, OUTPUT_THUMBNAILS_DIR)
    actions.push(action)

    // Copy to public if thumbnail was generated/overwritten
    if (action.action === 'generated_from_cue' || action.action === 'overwritten_from_cue') {
      if (action.thumbnailPath) {
        copyToPublic(action.thumbnailPath)
      }
    }

    // Log progress
    if (actions.length % 100 === 0) {
      console.log(`   Progress: ${actions.length}/${videos.length} videos...`)
    }
  }

  // Generate summary
  const summary = {
    total: actions.length,
    generated_from_cue: actions.filter(a => a.action === 'generated_from_cue').length,
    overwritten_from_cue: actions.filter(a => a.action === 'overwritten_from_cue').length,
    skipped_existing: actions.filter(a => a.action === 'skipped_existing').length,
    missing_cue: actions.filter(a => a.action === 'missing_cue').length,
    failed: actions.filter(a => a.action === 'failed').length
  }

  // Create report
  const report: ThumbnailReport = {
    timestamp: new Date().toISOString(),
    summary,
    actions
  }

  // Write report
  const reportPath = join(OUTPUT_REPORTS_DIR, 'thumbnails.report.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')

  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 SUMMARY')
  console.log('='.repeat(60))
  console.log(`   Total videos processed: ${summary.total}`)
  console.log(`   Generated from Cue 8: ${summary.generated_from_cue}`)
  console.log(`   Overwritten from Cue 8: ${summary.overwritten_from_cue}`)
  console.log(`   Skipped (existing, no Cue 8): ${summary.skipped_existing}`)
  console.log(`   Missing Cue 8 (no existing): ${summary.missing_cue}`)
  console.log(`   Failed: ${summary.failed}`)
  console.log(`\n📄 Report: ${reportPath}`)
  console.log('\n' + '='.repeat(60))
  if (summary.failed === 0) {
    console.log('✅ SUCCESS - Pipeline complete')
  } else {
    console.log('⚠️  COMPLETE - Some failures (see report)')
  }
  console.log('='.repeat(60) + '\n')
}

// Run pipeline
main().catch((error) => {
  console.error('Pipeline failed:', error)
  process.exit(1)
})
