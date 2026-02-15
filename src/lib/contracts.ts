export interface Video {
  id: string
  filePath: string
  filename: string
  artist: string
  title: string
  year: number
  duration: number
  thumbnail_url: string
  sources: string[]
}

export interface Song {
  artist: string
  title: string
  year: number
  chart_source: string
  chart_positions: number[]
}

export interface PlaylistEntry {
  videoId: string
  order: number
  addedAt: string
}

export interface Match {
  videoId: string
  songId: string
  confidence: string
  reasons: string[]
}
