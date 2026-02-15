import videoIndexUrl from '../../artifacts/output/video-index.json?url'
import { MEDIA_BASE } from '../config/media'
import { tierFromPlaycount, type CanonicalTier } from './tierMapping'
import { normalizeVideoPath } from './videoPath'

export type { CanonicalTier } from './tierMapping'

export type RawVideoIndexItem = Record<string, unknown> & {
  filePath?: string
  filepath?: string
  title?: string
  artist?: string
  author?: string
  album?: string
  genre?: string
  label?: string
  bpm?: number | string | null
  key?: string | null
  comments?: string
  year?: number | null
  duration_sec?: number | null
  durationSeconds?: number | null
  duration?: number | null
  playcount?: number | null
  playCount?: number | null
  play_count?: number | null
  firstSeen?: number | string | null
  first_seen?: number | string | null
  first_seen_ts?: number | string | null
  addedAt?: string | null
  videoId?: string
  video_id?: string
  tags?: Record<string, unknown>
  infos?: Record<string, unknown>
  scan?: Record<string, unknown>
  pois?: unknown[]
  rotationTier?: string
  tier?: 'Promo' | 'Light' | 'Medium' | 'Heavy' | 'Power' | null
  retentionScore?: number | null
  retention_score?: number | null
  retentionGrade?: 'S' | 'A' | 'B' | 'C' | string | null
  retention_grade?: 'S' | 'A' | 'B' | 'C' | string | null
  retentionStars?: number | null
  retention_stars?: number | null
  retentionStrength?: number | null
  retention_strength?: number | null
  retentionIndicator?: string | null
  retention_indicator?: string | null
  retentionBreakdown?: Record<string, number> | null
  retention_breakdown?: Record<string, number> | null
}

export type RotationTier = 'New' | 'Deep' | 'Rotation' | 'Power' | 'Heavy'
export type RetentionGrade = 'S' | 'A' | 'B' | 'C'

export type RetentionBreakdown = {
  xmlLifetimePlaycount: number
  historicalPlays: number
  eventDiversity: number
  bpmTransitionUtility: number
  genreCoverageUniqueness: number
  artistPresenceNetwork: number
  eraRelevance: number
  metadataCompleteness: number
  freshnessCurve: number
}

export type VideoRecord = {
  id: string
  videoId?: string
  filePath: string
  absolutePath: string | null
  filename: string
  title: string
  artist: string
  album: string
  genre: string
  label: string
  bpm: string
  key: string
  comments: string
  year: number | null
  durationSec: number | null
  playcount: number
  firstSeenMs: number | null
  addedAt: string | null
  thumbnailUrl?: string
  videoUrl?: string
  tags?: Record<string, unknown>
  infos?: Record<string, unknown>
  scan?: Record<string, unknown>
  pois: unknown[]
  rotationTier: RotationTier
  tier: CanonicalTier | null
  retentionScore: number
  retentionGrade: RetentionGrade
  retentionStars: number
  retentionStrength: number
  retentionIndicator: string
  retentionBreakdown: RetentionBreakdown | null
  raw: RawVideoIndexItem
}

const clampToInt = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim()) {
    const num = Number(value)
    if (Number.isFinite(num)) return Math.trunc(num)
  }
  return null
}

const parseEpochMs = (value: unknown): number | null => {
  const parsed = clampToInt(value)
  if (parsed === null) return null
  return parsed < 1e12 ? parsed * 1000 : parsed
}

const asString = (value: unknown): string => {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

const cleanMusicText = (value: string): string => {
  if (!value) return ''
  return value
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const deriveTitle = (filePath: string): string => {
  const name = filePath.split(/[/\\]/).pop() ?? ''
  const withoutExt = name.replace(/\.[a-z0-9]+$/i, '')
  const split = withoutExt.split(' - ')
  if (split.length > 1) {
    return cleanMusicText(split.slice(1).join(' - ')) || cleanMusicText(withoutExt) || 'Untitled'
  }
  return cleanMusicText(withoutExt) || 'Untitled'
}

const deriveArtist = (filePath: string): string => {
  const name = filePath.split(/[/\\]/).pop() ?? ''
  const withoutExt = name.replace(/\.[a-z0-9]+$/i, '')
  if (withoutExt.includes(' - ')) {
    return cleanMusicText(withoutExt.split(' - ')[0] ?? '') || 'Unknown'
  }
  return 'Unknown'
}

const buildMediaUrl = (rawPath: string, swapExt?: string): string | undefined => {
  const marker = '/VIDEO/'
  const idx = rawPath.indexOf(marker)
  if (idx === -1) return undefined
  const after = rawPath.slice(idx + marker.length)
  if (!after) return undefined
  const keyBase = `video/${after}`
  const withExt = swapExt ? keyBase.replace(/\.[^.]+$/i, swapExt) : keyBase
  const encoded = withExt
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${MEDIA_BASE}/${encoded}`
}

const hashPath = (value: string) => {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i)
  }
  return `v${hash >>> 0}`
}

const normalizeRotationTier = (value: unknown): RotationTier => {
  if (typeof value !== 'string') return 'Deep'
  const normalized = value.trim().toLowerCase()
  if (normalized === 'new') return 'New'
  if (normalized === 'rotation') return 'Rotation'
  if (normalized === 'power') return 'Power'
  if (normalized === 'heavy') return 'Heavy'
  return 'Deep'
}

const normalizeCanonicalTier = (value: unknown): CanonicalTier | null => {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'promo') return 'Promo'
  if (normalized === 'light') return 'Light'
  if (normalized === 'medium') return 'Medium'
  if (normalized === 'heavy') return 'Heavy'
  if (normalized === 'power') return 'Power'
  return null
}

const normalizeRetentionGrade = (value: unknown): RetentionGrade => {
  if (typeof value !== 'string') return 'C'
  const normalized = value.trim().toUpperCase()
  if (normalized === 'S' || normalized === 'A' || normalized === 'B') return normalized
  return 'C'
}

const toRetentionBreakdown = (value: unknown): RetentionBreakdown | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const keys = [
    'xmlLifetimePlaycount',
    'historicalPlays',
    'eventDiversity',
    'bpmTransitionUtility',
    'genreCoverageUniqueness',
    'artistPresenceNetwork',
    'eraRelevance',
    'metadataCompleteness',
    'freshnessCurve',
  ] as const

  const output: Partial<RetentionBreakdown> = {}
  for (const key of keys) {
    const raw = row[key]
    const parsed = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(raw)
    if (!Number.isFinite(parsed)) return null
    output[key] = parsed
  }
  return output as RetentionBreakdown
}

export const formatDuration = (secs: number | null): string => {
  if (typeof secs !== 'number' || Number.isNaN(secs)) return '—'
  const total = Math.max(0, Math.round(secs))
  const mm = Math.floor(total / 60)
  const ss = total % 60
  return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
}

export const formatYear = (year: number | null): string => (typeof year === 'number' ? String(year) : '—')

export const getRelativeVideoPath = (filePath: string): string => {
  const marker = '/VIDEO/'
  const idx = filePath.indexOf(marker)
  if (idx === -1) return filePath
  return `/VIDEO/${filePath.slice(idx + marker.length)}`
}

export const formatFriendlyAge = (dateValue: number | null): string => {
  if (!dateValue) return 'Unknown'
  const years = Math.floor((Date.now() - dateValue) / (365.25 * 24 * 60 * 60 * 1000))
  if (years < 1) {
    const months = Math.max(1, Math.floor((Date.now() - dateValue) / (30 * 24 * 60 * 60 * 1000)))
    return `${months} month${months === 1 ? '' : 's'} ago`
  }
  return `${years} year${years === 1 ? '' : 's'} ago`
}

export const parseVideoIndexRows = (items: RawVideoIndexItem[]): VideoRecord[] => {
  const ids = new Map<string, number>()

  return items
    .map((item, idx) => {
      const rawPath = asString(item.filePath ?? item.filepath)
      if (!rawPath) return null

      const normalized = normalizeVideoPath(rawPath)
      if (!normalized.relativePath) return null

      const year = clampToInt(item.year)
      const durationSec =
        clampToInt(item.duration_sec) ?? clampToInt(item.durationSeconds) ?? (typeof item.duration === 'number' ? item.duration : null)

      const playcount = clampToInt(item.playcount) ?? clampToInt(item.playCount) ?? clampToInt(item.play_count) ?? 0

      const firstSeenMs = parseEpochMs(item.firstSeen ?? item.first_seen ?? item.first_seen_ts)
      const tags = (item.tags && typeof item.tags === 'object' ? (item.tags as Record<string, unknown>) : undefined) ?? undefined
      const infos = (item.infos && typeof item.infos === 'object' ? (item.infos as Record<string, unknown>) : undefined) ?? undefined
      const scan = (item.scan && typeof item.scan === 'object' ? (item.scan as Record<string, unknown>) : undefined) ?? undefined
      const retentionScore = clampToInt(item.retentionScore ?? item.retention_score) ?? 0
      const retentionGrade = normalizeRetentionGrade(item.retentionGrade ?? item.retention_grade)
      const retentionStars = clampToInt(item.retentionStars ?? item.retention_stars) ?? Math.max(1, Math.round(retentionScore / 20))
      const retentionStrength =
        clampToInt(item.retentionStrength ?? item.retention_strength) ??
        (retentionScore >= 85 ? 4 : retentionScore >= 70 ? 3 : retentionScore >= 55 ? 2 : 1)
      const retentionIndicator =
        asString(item.retentionIndicator ?? item.retention_indicator) || `${'*'.repeat(Math.max(1, retentionStars))}${'-'.repeat(Math.max(0, 5 - Math.max(1, retentionStars)))}`
      const retentionBreakdown = toRetentionBreakdown(item.retentionBreakdown ?? item.retention_breakdown)

      const fallbackTitle = deriveTitle(normalized.relativePath)
      const title = cleanMusicText(asString(item.title)) || fallbackTitle
      const artist = cleanMusicText(asString(item.artist ?? item.author)) || deriveArtist(normalized.relativePath)
      const album = cleanMusicText(asString(item.album ?? tags?.album)) || '—'
      const genre = cleanMusicText(asString(item.genre ?? tags?.genre)) || '—'
      const label = cleanMusicText(asString(item.label ?? tags?.label)) || '—'
      const bpmRaw = asString(item.bpm ?? tags?.bpm ?? scan?.bpm)
      const keyRaw = asString(item.key ?? tags?.key ?? scan?.key)
      const comments = cleanMusicText(asString((item as { comments?: unknown }).comments ?? tags?.comment ?? tags?.comments)) || '—'

      const idBase = asString(item.videoId ?? item.video_id) || normalized.relativePath || `video-${idx}`
      const duplicate = ids.get(idBase) ?? 0
      ids.set(idBase, duplicate + 1)

      const videoId = asString(item.videoId ?? item.video_id) || undefined
      const inferredTier = tierFromPlaycount(playcount)
      const normalizedTier = normalizeCanonicalTier(item.tier)
      const tier = inferredTier ?? normalizedTier

      const row: VideoRecord = {
        id: duplicate === 0 ? idBase : `${idBase}#${duplicate}`,
        videoId,
        filePath: normalized.relativePath,
        absolutePath: normalized.absolutePath,
        filename: normalized.relativePath.split(/[/\\]/).pop() ?? '',
        title,
        artist,
        album,
        genre,
        label,
        bpm: bpmRaw || '—',
        key: keyRaw || '—',
        comments,
        year,
        durationSec,
        playcount,
        firstSeenMs,
        addedAt: asString(item.addedAt) || null,
        thumbnailUrl: buildMediaUrl(rawPath, '.jpg'),
        videoUrl: buildMediaUrl(rawPath),
        tags,
        infos,
        scan,
        pois: Array.isArray(item.pois) ? item.pois : [],
        rotationTier: normalizeRotationTier(item.rotationTier),
        tier,
        retentionScore,
        retentionGrade,
        retentionStars: Math.max(1, Math.min(5, retentionStars)),
        retentionStrength: Math.max(1, Math.min(4, retentionStrength)),
        retentionIndicator,
        retentionBreakdown,
        raw: item,
      }

      return row
    })
    .filter((row): row is VideoRecord => Boolean(row))
}

export const loadVideoIndex = async (): Promise<VideoRecord[]> => {
  const res = await fetch(videoIndexUrl)
  if (!res.ok) throw new Error(`Failed to load video-index.json (${res.status})`)
  const body = await res.json()
  const items = (Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : []) as RawVideoIndexItem[]
  return parseVideoIndexRows(items)
}

export const rowSearchText = (row: VideoRecord): string =>
  [row.title, row.artist, row.year ? String(row.year) : '', row.filePath, row.album, row.genre, row.retentionGrade, row.tier ?? ''].join(' ').toLowerCase()

export const stableVideoHash = (row: VideoRecord): string => row.videoId || row.id || hashPath(row.filePath)
