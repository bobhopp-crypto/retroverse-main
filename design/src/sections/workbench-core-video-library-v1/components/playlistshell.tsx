import type { VideoFile } from '../types'
import { PlaylistCard } from './playlistcard'
import { parseDuration } from '../utils/duration'

interface PlaylistShellProps {
  playlistTracks: VideoFile[]
  onVideoClick?: (video: VideoFile) => void
  onPlay?: (video: VideoFile) => void
  onRemove?: (video: VideoFile) => void
  onReorder?: (fromIndex: number, toIndex: number) => void
}

/**
 * Playlist Shell — Minimal stub for testing Random Panel
 * 
 * Displays:
 * - Count + total duration at top
 * - Compact playlist cards (PlaylistCard component)
 * - Play and Remove controls
 */
export function PlaylistShell({ playlistTracks, onVideoClick: _onVideoClick, onPlay, onRemove, onReorder }: PlaylistShellProps) {
  // Calculate total duration (normalize to seconds)
  const totalDurationSeconds = playlistTracks.reduce((sum, track) => {
    return sum + parseDuration(track.Length || '0:0')
  }, 0)

  const hours = Math.floor(totalDurationSeconds / 3600)
  const minutes = Math.floor((totalDurationSeconds % 3600) / 60)

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
      {/* Count + Duration Header */}
      <div className="mb-4 text-center">
        <div className="text-lg font-mono" style={{ color: 'var(--rv-text-muted)' }}>
          {playlistTracks.length.toString().padStart(3, '0')} tracks • {hours.toString().padStart(2, '0')}:{minutes.toString().padStart(2, '0')}
        </div>
      </div>

      {/* Playlist List */}
      {playlistTracks.length > 0 ? (
        <div className="space-y-0">
          {playlistTracks.map((video, index) => (
            <PlaylistCard
              key={`${video.FilePath}-${index}`}
              video={video}
              index={index}
              onPlay={() => onPlay?.(video)}
              onRemove={() => onRemove?.(video)}
              onReorder={onReorder}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12" style={{ color: 'var(--rv-text-muted)' }}>
          Playlist is empty
        </div>
      )}
    </div>
  )
}
