import { useState, useEffect } from 'react'
import { VideoLibraryHome as VideoLibraryHomeComponent } from './components/videolibraryhome'
import type { VideoFile } from './types'

/**
 * Thumbnail index: Maps FilePath -> thumbnail URL
 * e.g., "1960's/Carla Thomas - Comfort Me.mp4" -> "/thumbnails/1960's/Carla Thomas - Comfort Me.jpg"
 */
type ThumbnailIndex = Record<string, string>

/**
 * Normalize video-index item (object or array entry) to a flat shape.
 * Then map to VideoFile for the UI.
 */
function normalizeVideoIndexItem(
  raw: Record<string, unknown>,
  _id: string,
  thumbIndex: ThumbnailIndex
): VideoFile {
  const artist = (raw.artist as string) ?? ''
  const title = (raw.title as string) ?? ''
  const year = typeof raw.year === 'number' ? raw.year : 0
  const genre = (raw.genre as string) ?? 'Unknown'
  const duration = typeof raw.duration === 'number' ? raw.duration : 0
  const filePath = (raw.file_path as string) ?? (raw.FilePath as string) ?? ''
  const thumbnail = (raw.thumbnail as string) ?? undefined

  // Derive artist/title from file_path if missing (e.g. "Folder/Artist - Title.mp4")
  let finalArtist = artist
  let finalTitle = title
  let finalYear = year
  if (filePath) {
    const parts = filePath.split('/')
    const base = parts.pop() ?? ''
    const withoutExt = base.replace(/\.(mp4|mov|avi|mkv)$/i, '')
    if (!finalArtist && !finalTitle) {
      const dash = withoutExt.lastIndexOf(' - ')
      if (dash > 0) {
        finalArtist = withoutExt.slice(0, dash).trim()
        finalTitle = withoutExt.slice(dash + 3).trim()
      } else {
        finalTitle = withoutExt
      }
    }
    if (!finalYear && parts.length > 0) {
      const decadeMatch = parts.join('/').match(/(\d{4})'?s?/)
      if (decadeMatch) finalYear = parseInt(decadeMatch[1], 10)
    }
  }

  // Duration: seconds -> "M:SS"
  const mins = Math.floor(duration / 60)
  const secs = Math.floor(duration % 60)
  const length = `${mins}:${secs.toString().padStart(2, '0')}`

  // Decade from year
  const decade = finalYear ? `${Math.floor(finalYear / 10) * 10}s` : ''

  const thumbnailPath = thumbIndex[filePath]
  const thumbnailUrl = thumbnail ?? thumbnailPath?.replace(/^\/public/, '') ?? undefined

  return {
    Title: finalTitle || 'Unknown',
    Artist: finalArtist || 'Unknown',
    Genre: genre,
    Year: finalYear,
    Decade: decade,
    Length: length,
    PlayCount: 0,
    Grouping: '',
    FilePath: filePath,
    SourcePath: filePath,
    thumbnailUrl,
  }
}

/**
 * Preview wrapper for VideoLibraryHome
 * Loads /data/videolibrary.json and feeds normalized VideoFile[] to the library component.
 */
export default function VideoLibraryHome() {
  const [videos, setVideos] = useState<VideoFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const baseUrl = import.meta.env.BASE_URL
    const url = `${baseUrl}data/videolibrary.json`

    Promise.all([
      fetch(url).then((r) => r.json()),
      fetch(`${baseUrl}thumbnails-index.json`).then((r) => r.json()).catch(() => ({})),
    ])
      .then(([data, thumbIndex]: [unknown, ThumbnailIndex]) => {
        const rawList = Array.isArray(data)
          ? data
          : typeof data === 'object' && data !== null
            ? Object.entries(data as Record<string, Record<string, unknown>>).map(([id, item]) => ({
                ...item,
                video_id: (item as Record<string, unknown>).video_id ?? id,
                id: (item as Record<string, unknown>).id ?? id,
              }))
            : []

        const normalized: VideoFile[] = rawList.map((item, i) => {
          const row = item as Record<string, unknown>
          const id = (row.video_id as string) ?? (row.id as string) ?? String(i)
          return normalizeVideoIndexItem(row, id, thumbIndex)
        })

        setVideos(normalized)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Error loading data:', err)
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--rv-bg-base)', color: 'var(--rv-text)' }}>
        <div style={{ color: 'var(--rv-text-muted)' }}>Loading video library...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--rv-bg-base)', color: 'var(--rv-text)' }}>
        <div className="text-red-400">Error: {error}</div>
      </div>
    )
  }

  return <VideoLibraryHomeComponent videos={videos} />
}
