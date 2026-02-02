import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { VideoFile } from '../types'

interface VideoDetailOverlayProps {
  video: VideoFile | null
  open: boolean
  onClose: () => void
  onPlay?: (video: VideoFile) => void
  onAddToPlaylist?: (video: VideoFile) => void
  isInPlaylist?: (video: VideoFile) => boolean
}

export function VideoDetailOverlay({ 
  video, 
  open, 
  onClose, 
  onPlay, 
  onAddToPlaylist,
  isInPlaylist 
}: VideoDetailOverlayProps) {
  if (!video) return null

  const handlePlay = () => {
    if (onPlay) {
      onPlay(video)
      onClose()
    }
  }

  const handleAddToPlaylist = () => {
    if (onAddToPlaylist) {
      onAddToPlaylist(video)
    }
  }

  const inPlaylist = isInPlaylist?.(video) ?? false

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl" style={{ background: 'var(--rv-bg-panel)', borderColor: 'var(--rv-border)', color: 'var(--rv-text)' }}>
        <DialogHeader>
          <DialogTitle className="mb-4 text-lg sm:text-xl" style={{ color: 'var(--rv-text)' }}>{video.Title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Thumbnail - always render with placeholder fallback */}
          <img
            src={video.thumbnailUrl || '/thumbnails/placeholder.png'}
            alt=""
            className="w-full h-32 sm:h-48 object-cover rounded border"
            style={{ borderColor: 'var(--rv-border)' }}
          />

          {/* Details */}
          <div className="space-y-2 text-sm">
            <div className="flex">
              <span className="w-24" style={{ color: 'var(--rv-text-muted)' }}>Artist:</span>
              <span style={{ color: 'var(--rv-text)' }}>{video.Artist}</span>
            </div>
            <div className="flex">
              <span className="w-24" style={{ color: 'var(--rv-text-muted)' }}>Year:</span>
              <span style={{ color: 'var(--rv-text)' }}>{video.Year || 'Unknown'}</span>
            </div>
            <div className="flex">
              <span className="w-24" style={{ color: 'var(--rv-text-muted)' }}>Genre:</span>
              <span style={{ color: 'var(--rv-text)' }}>{video.Genre || 'Unknown'}</span>
            </div>
            <div className="flex">
              <span className="w-24" style={{ color: 'var(--rv-text-muted)' }}>Duration:</span>
              <span style={{ color: 'var(--rv-text)' }}>{video.Length}</span>
            </div>
            <div className="flex">
              <span className="w-24" style={{ color: 'var(--rv-text-muted)' }}>Plays:</span>
              <span style={{ color: 'var(--rv-text)' }}>{video.PlayCount}</span>
            </div>
            {video.Grouping && (
              <div className="flex">
                <span className="w-24" style={{ color: 'var(--rv-text-muted)' }}>Grouping:</span>
                <span style={{ color: 'var(--rv-text)' }}>{video.Grouping}</span>
              </div>
            )}
            {video.FilePath && (
              <div className="flex">
                <span className="w-24" style={{ color: 'var(--rv-text-muted)' }}>Path:</span>
                <span className="text-xs font-mono break-all" style={{ color: 'var(--rv-text-muted)' }}>{video.FilePath}</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t" style={{ borderColor: 'var(--rv-border)' }}>
          {onPlay && (
            <button
              onClick={handlePlay}
              className="flex-1 px-4 py-2.5 rounded text-sm font-medium transition-colors border hover:bg-[var(--rv-accent-hover)]"
              style={{ background: 'var(--rv-accent)', color: 'var(--rv-text)', borderColor: 'var(--rv-accent)' }}
            >
              Play
            </button>
          )}
          {onAddToPlaylist && (
            <button
              onClick={handleAddToPlaylist}
              className={`flex-1 px-4 py-2.5 rounded text-sm font-medium transition-colors border ${
                inPlaylist
                  ? 'hover:bg-[var(--rv-accent-hover)]'
                  : 'bg-[var(--rv-bg-hover)] hover:bg-[var(--rv-border)] hover:text-[var(--rv-text)]'
              }`}
              style={
                inPlaylist
                  ? { background: 'var(--rv-accent)', color: 'var(--rv-text)', borderColor: 'var(--rv-accent)' }
                  : { color: 'var(--rv-text-muted)', borderColor: 'var(--rv-border)' }
              }
            >
              {inPlaylist ? 'Remove from Playlist' : 'Add to Playlist'}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
