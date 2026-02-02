import type { VideoFile } from '../types'

interface VideoRowProps {
  video: VideoFile
  onClick: () => void
}

export function VideoRow({ video, onClick }: VideoRowProps) {
  // Format time: remove leading zeros from minutes (e.g., "03:45" -> "3:45")
  const formatTime = (time: string) => {
    if (!time) return ''
    const parts = time.split(':')
    if (parts.length === 2) {
      const minutes = parts[0].replace(/^0+/, '') || '0'
      return `${minutes}:${parts[1]}`
    }
    return time
  }

  return (
    <button
      onClick={onClick}
      className="w-full p-3 sm:p-4 transition-colors border-b text-left bg-transparent hover:bg-[var(--rv-bg-hover)] border-[var(--rv-border)]"
    >
      <div className="flex gap-3 sm:gap-4 items-center">
        {/* Thumbnail - always render with placeholder fallback */}
        <img
          src={video.thumbnailUrl || '/thumbnails/placeholder.png'}
          alt=""
          loading="lazy"
          className="w-12 h-12 rounded object-cover shrink-0"
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title: Max 2 lines, fixed font size and line-height */}
          <div className="font-semibold text-sm leading-[1.3] mb-1 line-clamp-2" style={{ color: 'var(--rv-text)' }}>
            {video.Title}
          </div>
          
          {/* Artist: 1 line only, smaller than title */}
          <div className="text-[10px] leading-[1.2] mb-2 truncate" style={{ color: 'var(--rv-text-muted)' }}>
            {video.Artist}
          </div>
          
          {/* Line 3: Metadata bar - grid layout */}
          <div className="meta-row" style={{ color: 'var(--rv-text-muted)' }}>
            <span className="meta-year">{video.Year || 'Unknown'}</span>
            <span className="text-center">•</span>
            <span className="meta-time">{formatTime(video.Length)}</span>
            <span className="meta-genre">{video.Genre || ''}</span>
            <span className="meta-plays">{video.PlayCount}</span>
          </div>
        </div>
      </div>
    </button>
  )
}
