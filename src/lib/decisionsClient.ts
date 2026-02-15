const API_BASE = import.meta.env.VITE_PIPELINE_API || 'http://localhost:8787'

export type ChartSourceType = 'billboard_hot_100' | 'american_top_40' | 'country' | 'rnb' | 'unknown' | (string & {})

export type DecisionChoice = 'accepted' | 'rejected' | 'revoked'
export type DecisionConfidence = 'exact' | 'high' | 'medium'
export type DecisionMethod = 'batch' | 'manual'

export interface MatchCandidate {
  chart_song_id: string
  source_type?: ChartSourceType
  chart_artist: string
  chart_title: string
  best_chart_year: number
  score: number
  confidence: DecisionConfidence
  reasons: string[]
}

export interface MatchEntry {
  video_id: string
  video_artist: string | null
  video_title: string | null
  candidates: MatchCandidate[]
}

export interface MatchSummary {
  videos_total: number
  videos_matched: number
  videos_unmatched: number
  exact_matches: number
  high_matches: number
  medium_matches: number
  total_comparisons: number
  max_candidates_per_video: number
  avg_candidates_per_video: number
  reduction_pct_vs_naive: number
  decisions_skipped_accepted?: number
  decisions_skipped_reviewable?: number
  decisions_rejected_filtered?: number
}

export interface MatchFile {
  meta: { run_id: string; generated_at: string }
  summary: MatchSummary
  matches: MatchEntry[]
}

export interface DecisionRecord {
  video_id: string
  chart_song_id: string
  source_type?: ChartSourceType
  decision: DecisionChoice
  confidence: DecisionConfidence
  reviewable: boolean
  method: DecisionMethod
  run_id: string
  timestamp: string
  notes?: string
}

export const fetchLatestMatches = async (): Promise<MatchFile> => {
  const res = await fetch(`${API_BASE}/api/matching/latest`)
  if (!res.ok) throw new Error(`Failed to load matches (${res.status})`)
  return res.json()
}

export const fetchDecisionLedger = async () => {
  const res = await fetch(`${API_BASE}/api/decisions`)
  if (!res.ok) throw new Error(`Failed to load decisions (${res.status})`)
  return res.json() as Promise<{ entries: DecisionRecord[]; summary: Record<string, number> }>
}

export const appendDecisions = async (records: DecisionRecord[]) => {
  const res = await fetch(`${API_BASE}/api/decisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(records),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to save decisions')
  }
  return res.json()
}

export const updateDecision = async (videoId: string, record: DecisionRecord) => {
  const res = await fetch(`${API_BASE}/api/decisions/${encodeURIComponent(videoId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to update decision')
  }
  return res.json()
}

export const deleteDecision = async (videoId: string) => {
  const res = await fetch(`${API_BASE}/api/decisions/${encodeURIComponent(videoId)}`, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to delete decision')
  }
  return res.json()
}

export const acceptDecisions = async (records: DecisionRecord[]) => {
  const res = await fetch(`${API_BASE}/api/decisions/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(records),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to accept decisions')
  }
  return res.json()
}

export const fetchMatchingOverview = async () => {
  const res = await fetch(`${API_BASE}/api/matching/overview`)
  if (!res.ok) throw new Error(`Failed to load overview (${res.status})`)
  return res.json() as Promise<{
    run_id: string | null
    summary: MatchSummary
    decisions: { accepted: number; reviewable: number; rejected: number; revoked: number }
    unmatched: number | null
  }>
}

export const checkApiHealth = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${API_BASE}/api/health`)
    return res.ok
  } catch {
    return false
  }
}

export interface BillboardSong {
  chart_song_id: string
  artist: string
  title: string
  first_chart_year?: number
  last_chart_year?: number
  peak_position?: number
  chart_appearances?: number
}

export const searchBillboardSongs = async (query: string, limit = 15) => {
  const res = await fetch(
    `${API_BASE}/api/search/billboard?query=${encodeURIComponent(query)}&limit=${limit}`,
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Billboard search failed (${res.status})`)
  }
  return res.json() as Promise<{ query: string; count: number; results: BillboardSong[] }>
}
