import { useEffect, useState } from 'react'
import videoIndexUrl from '../../artifacts/output/video-index.json?url'
import './VideoLibraryV2.css'

type RawVideoIndexItem = {
  filePath?: string
  filepath?: string
}

type VideoRecord = {
  id: string
  title: string
  artist: string
  filePath: string
  thumbnailUrl: string | undefined
}

const deriveNames = (filePath: string): { title: string; artist: string } => {
  const filename = filePath.split(/[/\\]/).pop() ?? ''
  const withoutExt = filename.replace(/\.mp4$/i, '')
  const separatorIndex = withoutExt.indexOf(' - ')

  if (separatorIndex === -1) {
    const title = withoutExt.trim() || 'Untitled video'
    return { title, artist: '⚠️ Filename needs review' }
  }

  const artist = withoutExt.slice(0, separatorIndex).trim() || 'Unknown Artist'
  const title = withoutExt.slice(separatorIndex + 3).trim() || withoutExt.trim() || 'Untitled video'
  return { title, artist }
}

const parseIndex = (items: RawVideoIndexItem[]): VideoRecord[] =>
  items
    .map((item, index) => {
      const filePath = item.filePath ?? item.filepath ?? ''
      if (!filePath) return null
      const { title, artist } = deriveNames(filePath)
      return {
        id: filePath || `video-${index}`,
        title,
        artist,
        filePath,
        thumbnailUrl: (item as { thumbnail_url?: string })?.thumbnail_url,
      }
    })
    .filter((item): item is VideoRecord => Boolean(item))

export default function VideoLibraryV2() {
  const [videos, setVideos] = useState<VideoRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visualMode, setVisualMode] = useState(false)
  const rowColors = ['#f3f6ff', '#eaf7f1', '#fff4ec', '#fef7ff', '#f2fbff']

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(videoIndexUrl)
        if (!res.ok) throw new Error(`Failed to load video-index.json (${res.status})`)
        const body = await res.json()
        const items = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : []
        const parsed = parseIndex(items)
        if (!cancelled) setVideos(parsed)
      } catch (err) {
        if (!cancelled) setError((err as Error).message || 'Failed to load videos')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="video-library-v2">
      <div className="vl2-band-wrap">
        <div className="vl2-header">
          <div>
            <div className="vl2-title">Video Library v2</div>
            <div className="vl2-subtle">Static inventory from artifacts/output/video-index.json</div>
          </div>
          <div className="vl2-controls">
            <button
              type="button"
              className={`vl2-toggle ${visualMode ? 'on' : 'off'}`}
              onClick={() => setVisualMode((v) => !v)}
            >
              Compact / Visual
            </button>
            <div className="vl2-status">
              {loading ? 'Loading…' : error ? 'Load failed' : `${videos.length} videos`}
            </div>
          </div>
        </div>

        {error ? (
          <div className="vl2-empty">Failed to load videos: {error}</div>
        ) : videos.length === 0 && !loading ? (
          <div className="vl2-empty">No videos available.</div>
        ) : (
          <div className={`vl2-list ${visualMode ? 'visual' : 'compact'}`}>
            {videos.map((video, index) => (
              <article
                key={video.id}
                className="vl2-row"
                style={{ backgroundColor: rowColors[index % rowColors.length] }}
              >
                <div className="vl2-thumb-wrap" aria-hidden>
                  <img
                    className="vl2-thumb"
                    src={video.thumbnailUrl || '/thumbnail-placeholder.svg'}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      const target = e.currentTarget
                      if (target.dataset.fallbackApplied === 'true') return
                      target.dataset.fallbackApplied = 'true'
                      target.src = '/thumbnail-placeholder.svg'
                    }}
                  />
                </div>
                <div className="vl2-row-text">
                  <div className="vl2-row-title">{video.title}</div>
                  <div className="vl2-row-artist">{video.artist}</div>
                  <div className="vl2-row-meta">—</div>
                </div>
                <div className="vl2-row-actions" aria-hidden>
                  <button type="button" className="vl2-icon-btn" disabled title="Info disabled">
                    i
                  </button>
                  <button type="button" className="vl2-icon-btn" disabled title="Add disabled">
                    +
                  </button>
                  <button type="button" className="vl2-icon-btn" disabled title="Play disabled">
                    ▶
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
