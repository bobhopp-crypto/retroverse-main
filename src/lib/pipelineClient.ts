export type PipelineStep =
  | 'ingest-vdj'
  | 'parse-playlists'
  | 'extract-mp4-metadata'
  | 'reconcile-youtube'
  | 'fuzzy-match'
  | 'generate-thumbnails'
  | 'build-index'
  | 'publish-r2'
  | 'full-run'

export interface PipelineResponse {
  step: PipelineStep
  message: string
  details?: Record<string, unknown>
  error?: string
}

const API_BASE = import.meta.env.VITE_PIPELINE_API || 'http://localhost:8787'

export const triggerStep = async (step: PipelineStep): Promise<PipelineResponse> => {
  const res = await fetch(`${API_BASE}/api/pipeline/${step}`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Request failed (${res.status})`)
  }
  return res.json()
}

export const pipelineSteps: { step: PipelineStep; label: string; desc: string }[] = [
  { step: 'ingest-vdj', label: 'VDJ Ingest', desc: 'Parse VirtualDJ database.xml into track objects.' },
  { step: 'parse-playlists', label: 'Playlists', desc: 'Read .m3u crates and normalize ordering.' },
  { step: 'extract-mp4-metadata', label: 'MP4 Metadata', desc: 'Scan local video files and read tags.' },
  { step: 'reconcile-youtube', label: 'YouTube Reference', desc: 'Load YouTube IDs from reference JSON.' },
  { step: 'fuzzy-match', label: 'Fuzzy Match', desc: 'Link videos to YouTube IDs with fuzzy search.' },
  { step: 'generate-thumbnails', label: 'Thumbnails', desc: 'Capture preview frames via ffmpeg.' },
  { step: 'build-index', label: 'Build Index', desc: 'Combine sources into video-index.json.' },
  { step: 'publish-r2', label: 'Publish to R2', desc: 'Sync index and thumbnails to R2 bucket.' },
  { step: 'full-run', label: 'Full Run', desc: 'Execute all steps sequentially.' },
]
