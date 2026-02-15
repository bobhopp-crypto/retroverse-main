const API_BASE = import.meta.env.VITE_PIPELINE_API || 'http://127.0.0.1:8787'

export interface VideoIndexApiItem {
  filePath?: string
  filepath?: string
  relative_media_path?: string | null
  video_id?: string | null
  video_url?: string | null
  title: string
  artist?: string | null
  duration?: number | null
  durationSeconds?: number | null
  youtubeId?: string | null
  playlists: string[]
  thumbnail?: string | null
  thumbnail_url?: string | null
  sources: string[]
  videoId?: string
  year?: number | null
  playCount?: number | null
  play_count?: number | null
  tier?: 'Promo' | 'Light' | 'Medium' | 'Heavy' | 'Power' | null
  retentionScore?: number | null
  retentionGrade?: 'S' | 'A' | 'B' | 'C' | null
  retentionStars?: number | null
  retentionStrength?: number | null
  retentionIndicator?: string | null
  retentionBreakdown?: Record<string, number> | null
  addedAt?: string | null
  lastPlayed?: string | null
}

export interface VideoIndexResponse {
  count: number
  source?: {
    indexPath?: string
    indexMtime?: number | null
    vdjPath?: string | null
    vdjRunId?: string | null
    generated_at?: string | null
  }
  items: VideoIndexApiItem[]
}

export const fetchVideoIndex = async (): Promise<VideoIndexResponse> => {
  const res = await fetch(`${API_BASE}/api/video-index`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Failed to load video index (${res.status})`)
  }
  return res.json() as Promise<VideoIndexResponse>
}
