import { useEffect, useState } from 'react'
import { VideoLibraryHome } from '../sections/workbench-core-video-library-v1/components/videolibraryhome'
import type { VideoFile } from '../sections/workbench-core-video-library-v1/types'

interface RawVideo {
  file_path?: string
  title?: string
  artist?: string
  genre?: string
  year?: number
  playcount?: number
  songlength?: number
  thumbnail?: string
  r2_url?: string
  firstseen_epoch?: number
  firstseen_date?: string
}

function secondsToLength(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function yearToDecade(year: number): string {
  const decade = Math.floor(year / 10) * 10
  return `${decade}'s`
}

function mapRawToVideoFile(raw: RawVideo, thumbIndex: Record<string, string>): VideoFile {
  const THUMB_BASE = 'https://pub-5c80acab1a7448259a26f1161a3fe649.r2.dev/'

  const year = Number(raw.year) || 0
  const daysSinceAdded =
    raw.firstseen_epoch != null
      ? Math.floor((Date.now() / 1000 - raw.firstseen_epoch) / 86400)
      : undefined

  const filePath = String(raw.file_path ?? '')
  const normalizedFilePath = filePath.replace(/\\/g, '/')
  const relativeVideoPath = (() => {
    const match = normalizedFilePath.match(/\/video\/(.+)$/i)
    return match ? match[1] : normalizedFilePath.replace(/^\/+/, '')
  })()

  // Build thumbnail path alongside video (R2 keys keep original names). Prefer r2_url path; fallback to FilePath-derived.
  const thumbPathFromR2 = (() => {
    if (!raw.r2_url) return null
    try {
      const url = new URL(raw.r2_url)
      const decodedPath = decodeURIComponent(url.pathname)
      return decodedPath.replace(/\.mp4$/i, '.jpg').replace(/^\/+/, '')
    } catch {
      return null
    }
  })()
  const thumbPathFromFile = normalizedFilePath
    ? decodeURIComponent(normalizedFilePath)
        .replace(/.*\/video\//i, 'video/')
        .replace(/^\/+/, '')
        .replace(/\.mp4$/i, '.jpg')
    : ''

  // Thumbnail lookup priority: sibling jpg path, then index by path variants, then raw.thumbnail
  const thumbnailPath =
    thumbPathFromR2 ??
    thumbIndex?.[normalizedFilePath] ??
    thumbIndex?.[relativeVideoPath] ??
    thumbIndex?.[relativeVideoPath.replace(/^video\//i, '')] ??
    thumbIndex?.[relativeVideoPath.replace(/^[^/]+\/(.+)$/, '$1')] ??
    thumbPathFromFile ??
    raw.thumbnail

  const thumbPath = thumbnailPath
    ? thumbnailPath.replace(/^\/public\//, '').replace(/^public\//, '').replace(/^\/+/, '')
    : ''
  const encodePath = (p: string) =>
    p
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/')
  const thumbnailUrl = thumbPath ? `${THUMB_BASE}${encodePath(thumbPath)}` : undefined

  const streamPath = raw.r2_url
    ? (() => {
        try {
          const u = new URL(raw.r2_url)
          const decoded = decodeURIComponent(u.pathname).replace(/^\/+/, '')
          const encodedPath = encodePath(decoded)
          return `${u.origin}/${encodedPath}`
        } catch {
          return undefined
        }
      })()
    : undefined

  return {
    Title: String(raw.title ?? ''),
    Artist: String(raw.artist ?? ''),
    Genre: String(raw.genre ?? ''),
    Year: year,
    Decade: yearToDecade(year),
    Length: secondsToLength(Number(raw.songlength) || 0),
    PlayCount: Number(raw.playcount) || 0,
    Grouping: '',
    FilePath: filePath,
    SourcePath: filePath,
    StreamPath: streamPath,
    RelativeVideoPath: relativeVideoPath,
    thumbnailUrl,
    FirstSeenUnix: raw.firstseen_epoch,
    DaysSinceAdded: daysSinceAdded,
  }
}

export default function VideoLibraryPage() {
  const [videos, setVideos] = useState<VideoFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    Promise.all([
      fetch(`${base}/data/videolibrary.json`).then((res) => {
        if (!res.ok) throw new Error(`videos HTTP ${res.status}`)
        return res.json()
      }),
      fetch(`${base}/thumbnails-index.json`)
        .then((res) => (res.ok ? res.json() : {}))
        .catch(() => ({})),
    ])
      .then(([raw, thumbIndex]) => {
        const arr = Array.isArray(raw) ? raw : []
        setVideos(arr.map((item) => mapRawToVideoFile(item as RawVideo, thumbIndex as Record<string, string>)))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load videos'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="rv-page min-h-screen flex items-center justify-center" style={{ background: 'var(--rv-bg)' }}>
        <p style={{ color: 'var(--rv-text-muted)' }}>Loading video library…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rv-page min-h-screen flex items-center justify-center" style={{ background: 'var(--rv-bg)' }}>
        <p style={{ color: 'var(--rv-text)' }}>Error: {error}</p>
      </div>
    )
  }

  return (
    <div className="rv-page">
      <VideoLibraryHome videos={videos} />
    </div>
  )
}
