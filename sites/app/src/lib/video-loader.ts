/**
 * Video file loading and normalization utilities
 * Converts VirtualDJ export format (PascalCase) to normalized lowercase format
 */

// VirtualDJ export format (input)
interface VirtualDJVideoFile {
  FilePath: string
  Tags?: {
    Title?: string
    Author?: string
    Year?: string
    Genre?: string
    Stars?: string
    Grouping?: string
    [key: string]: unknown
  }
  Infos?: {
    PlayCount?: string
    LastModified?: string
    FirstSeen?: string
    SongLength?: string
    [key: string]: unknown
  }
  Thumbnail?: number | string
  [key: string]: unknown
}

// Normalized format (output)
export interface VideoFile {
  id: string
  path: string
  filePath: string // Alias for path
  title: string
  artist: string
  year: number // Defaults to 0 if missing
  genre?: string
  stars: number // Defaults to 0 if missing
  playCount: number // Defaults to 0 if missing
  grouping: string // Defaults to "" if missing
  durationSec: number // Defaults to 0 if missing
  playcountBucket?: 'heavy' | 'med' | 'light' | 'none'
  thumbnailUrl?: string // Thumbnail URL (curated or auto), if available
  lastModified?: number
  firstSeen?: number
}

/**
 * Generate a safe, ASCII-only ID from a file path and index
 * Handles Unicode characters by replacing them with underscores
 */
function generateSafeId(path: string, index: number): string {
  // Extract filename from path
  const filename = path.split(/[/\\]/).pop() || 'file'
  
  // Normalize Unicode to decomposed form (NFKD), then sanitize to ASCII-only
  const sanitized = filename
    .normalize('NFKD') // Decompose Unicode (é → e + ́)
    .replace(/[^\x00-\x7F]/g, '_') // Replace non-ASCII with underscore
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace special chars with underscore
    .replace(/_{2,}/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, '') // Remove leading/trailing underscores
    .slice(0, 30) // Limit length
  
  return `video-${index}-${sanitized || 'file'}`
}

/**
 * Normalize a single VirtualDJ video file to the standard format
 */
function normalizeVideoFile(raw: VirtualDJVideoFile, index: number): VideoFile | null {
  // Extract and normalize fields
  const titleRaw = raw.Tags?.Title?.trim()
  const artistRaw = raw.Tags?.Author?.trim()
  const path = raw.FilePath?.trim()

  // Only require path (filter out if missing)
  if (!path) {
    return null
  }

  // Apply defaults for missing fields
  const title = titleRaw || '(Unknown Title)'
  const artist = artistRaw || '(Unknown Artist)'

  // Parse year, default to 0 if missing/invalid
  let year: number = 0
  if (raw.Tags?.Year) {
    const parsedYear = parseInt(raw.Tags.Year, 10)
    if (!isNaN(parsedYear) && parsedYear > 1900 && parsedYear < 2100) {
      year = parsedYear
    }
  }

  // Parse stars, default to 0 if missing/invalid
  let stars: number = 0
  if (raw.Tags?.Stars) {
    const parsedStars = parseInt(raw.Tags.Stars, 10)
    if (!isNaN(parsedStars) && parsedStars >= 0 && parsedStars <= 5) {
      stars = parsedStars
    }
  }

  // Parse play count, default to 0 if missing/invalid
  let playCount: number = 0
  if (raw.Infos?.PlayCount) {
    const parsedCount = parseInt(raw.Infos.PlayCount, 10)
    if (!isNaN(parsedCount) && parsedCount >= 0) {
      playCount = parsedCount
    }
  }

  // Parse duration, default to 0 if missing/invalid
  let durationSec: number = 0
  if (raw.Infos?.SongLength) {
    const parsedDuration = parseFloat(raw.Infos.SongLength)
    if (!isNaN(parsedDuration) && parsedDuration >= 0) {
      durationSec = Math.floor(parsedDuration)
    }
  }

  // Extract grouping, default to ""
  const grouping = raw.Tags?.Grouping?.trim() || ""

  // Extract thumbnail position (for future use)
  const thumbnailPosition = raw.Thumbnail

  // Parse timestamps
  let lastModified: number | undefined
  if (raw.Infos?.LastModified) {
    const parsed = parseInt(raw.Infos.LastModified, 10)
    if (!isNaN(parsed) && parsed > 0) {
      lastModified = parsed
    }
  }

  let firstSeen: number | undefined
  if (raw.Infos?.FirstSeen) {
    const parsed = parseInt(raw.Infos.FirstSeen, 10)
    if (!isNaN(parsed) && parsed > 0) {
      firstSeen = parsed
    }
  }

  // Extract genre
  const genre = raw.Tags?.Genre?.trim()

  // Generate unique ID from path and index (Unicode-safe)
  const id = generateSafeId(path, index)

  // Playcount bucket will be computed after thresholds are calculated in library.ts
  // Set to undefined here, will be populated by classifyAllVideos()

  return {
    id,
    path,
    filePath: path, // Alias for path
    title,
    artist,
    year,
    genre,
    stars,
    playCount,
    grouping,
    durationSec,
    playcountBucket: undefined, // Will be populated after threshold computation
    thumbnailUrl: undefined, // Will be populated when thumbnail generation is implemented
    lastModified,
    firstSeen,
  }
}


/**
 * Validate that a video file has all required fields (only path is required)
 */
function validateVideoFile(video: VideoFile): boolean {
  return !!video.path
}

/**
 * Load and normalize video files from VideoFiles.json
 */
export async function loadVideoFiles(): Promise<VideoFile[]> {
  try {
    const response = await fetch('/data/VideoFiles.json')
    if (!response.ok) {
      throw new Error(`Failed to load video files: ${response.status} ${response.statusText}`)
    }

    const rawData: VirtualDJVideoFile[] = await response.json()

    if (!Array.isArray(rawData)) {
      throw new Error('VideoFiles.json does not contain an array')
    }

    // Normalize all files and filter out invalid ones
    const normalized = rawData
      .map((raw, index) => normalizeVideoFile(raw, index))
      .filter((video): video is VideoFile => video !== null && validateVideoFile(video))

    return normalized
  } catch (error) {
    console.error('Error loading video files:', error)
    throw error
  }
}