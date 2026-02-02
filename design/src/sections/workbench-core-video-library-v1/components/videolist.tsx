import type { VideoFile } from '../types'
import { VideoRow } from './videorow'

interface VideoListProps {
  videos: VideoFile[]
  onVideoClick: (video: VideoFile) => void
}

export function VideoList({ videos, onVideoClick }: VideoListProps) {
  if (videos.length === 0) {
    return (
      <div className="text-center py-12" style={{ color: 'var(--rv-text-muted)' }}>
        No videos found matching your filters.
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {videos.map((video, index) => (
        <VideoRow
          key={`${video.FilePath}-${index}`}
          video={video}
          onClick={() => onVideoClick(video)}
        />
      ))}
    </div>
  )
}
