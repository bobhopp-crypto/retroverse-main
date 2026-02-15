import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  acceptDecisions,
  appendDecisions,
  checkApiHealth,
  deleteDecision,
  fetchDecisionLedger,
  fetchLatestMatches,
  fetchMatchingOverview,
  searchBillboardSongs,
  updateDecision,
  type BillboardSong,
  type DecisionRecord,
  type MatchCandidate,
  type MatchEntry,
  type MatchFile,
} from '../lib/decisionsClient'

type Tab = 'pending' | 'accepted' | 'reviewable'

type CardSearchState = {
  query: string
  results: BillboardSong[]
  total: number | null
  loading: boolean
  error: string | null
  limit: number
  cursor: number
  open: boolean
}

const confidenceOrder = { exact: 0, high: 1, medium: 2 }
const ruleReviewable = (confidence: MatchCandidate['confidence']) => confidence === 'medium'

const defaultSearchState: CardSearchState = {
  query: '',
  results: [],
  total: null,
  loading: false,
  error: null,
  limit: 8,
  cursor: -1,
  open: false,
}

const confidenceCopy: Record<MatchCandidate['confidence'], string> = {
  exact: 'Exact match (model certain)',
  high: 'High confidence candidate',
  medium: 'Medium confidence — review advised',
}

export default function MatchInspector() {
  const [matches, setMatches] = useState<MatchFile | null>(null)
  const [decisions, setDecisions] = useState<DecisionRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('pending')
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [savingEdit, setSavingEdit] = useState(false)
  const [acceptMediumArmed, setAcceptMediumArmed] = useState(false)
  const [queueFilter, setQueueFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<{
    record: DecisionRecord
    entry: MatchEntry
    selectedId: string
    search: string
  } | null>(null)
  const [overview, setOverview] = useState<{ run_id: string | null; unmatched: number | null } | null>(null)

  const [matchingMode, setMatchingMode] = useState(false)
  const [activeCardIndex, setActiveCardIndex] = useState(0)
  const [expandedCandidates, setExpandedCandidates] = useState<Set<string>>(new Set())
  const [expandedMeta, setExpandedMeta] = useState<Set<string>>(new Set())
  const [searchState, setSearchState] = useState<Record<string, CardSearchState>>({})
  const [batchMenuOpen, setBatchMenuOpen] = useState(false)

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const searchRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const actionsDisabled = apiStatus !== 'online' || loading
  const runId = matches?.meta.run_id ?? 'unknown'

  const getSearchState = useCallback(
    (videoId: string): CardSearchState => searchState[videoId] ?? defaultSearchState,
    [searchState],
  )

  const updateSearchState = (videoId: string, updates: Partial<CardSearchState>) => {
    setSearchState((prev) => ({ ...prev, [videoId]: { ...getSearchState(videoId), ...updates } }))
  }

  const loadAll = useCallback(
    async (opts: { allowed?: boolean } = {}) => {
      if (!opts.allowed && apiStatus !== 'online') return
      setLoading(true)
      setError(null)
      try {
        const [mf, ledger, ov] = await Promise.all([fetchLatestMatches(), fetchDecisionLedger(), fetchMatchingOverview()])
        setMatches(mf)
        setDecisions(ledger.entries)
        setOverview({ run_id: ov.run_id, unmatched: ov.unmatched })
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [apiStatus],
  )

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      try {
        const healthy = await checkApiHealth()
        if (cancelled) return
        setApiStatus(healthy ? 'online' : 'offline')
        if (healthy) await loadAll({ allowed: true })
      } catch (err) {
        if (!cancelled) {
          setApiStatus('offline')
          setError((err as Error).message)
        }
      }
    }
    boot()
    return () => {
      cancelled = true
    }
  }, [loadAll])

  useEffect(() => {
    setActiveCardIndex(0)
  }, [tab])

  const latestDecisionByVideo = useMemo(() => {
    const map = new Map<string, DecisionRecord>()
    for (const d of decisions) {
      const existing = map.get(d.video_id)
      const existingTime = existing ? new Date(existing.timestamp).getTime() : -Infinity
      const currentTime = new Date(d.timestamp).getTime()
      if (currentTime >= existingTime) map.set(d.video_id, d)
    }
    return map
  }, [decisions])

  const filteredPending = useMemo(() => {
    if (!matches) return []
    const q = queueFilter.toLowerCase().trim()
    return matches.matches
      .filter((m) => !latestDecisionByVideo.has(m.video_id))
      .filter((m) => {
        if (!q) return true
        const haystack = `${m.video_artist ?? ''} ${m.video_title ?? ''} ${m.video_id} ${m.candidates
          .map((c) => `${c.chart_artist} ${c.chart_title} ${c.chart_song_id}`)
          .join(' ')}`.toLowerCase()
        return haystack.includes(q)
      })
      .sort(
        (a, b) =>
          (confidenceOrder[a.candidates[0]?.confidence ?? 'medium'] ?? 2) -
          (confidenceOrder[b.candidates[0]?.confidence ?? 'medium'] ?? 2),
      )
  }, [matches, latestDecisionByVideo, queueFilter])

  const currentDecisions = useMemo(() => Array.from(latestDecisionByVideo.values()), [latestDecisionByVideo])
  const accepted = useMemo(
    () => currentDecisions.filter((d) => d.decision === 'accepted' && !d.reviewable),
    [currentDecisions],
  )
  const reviewable = useMemo(
    () => currentDecisions.filter((d) => d.decision === 'accepted' && d.reviewable),
    [currentDecisions],
  )

  useEffect(() => {
    setActiveCardIndex((idx) => {
      if (filteredPending.length === 0) return 0
      return Math.min(filteredPending.length - 1, Math.max(0, idx))
    })
  }, [filteredPending.length])

  const chunk = <T,>(items: T[], size: number): T[][] => {
    const chunks: T[][] = []
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size))
    }
    return chunks
  }

  const saveDecisions = async (records: DecisionRecord[]) => {
    if (apiStatus !== 'online' || records.length === 0) return

    setDecisions((prev) => [...prev, ...records])
    setSelected(new Set())
    setLoading(true)

    const acceptedRecords = records.filter((r) => r.decision === 'accepted')
    const others = records.filter((r) => r.decision !== 'accepted')

    try {
      if (acceptedRecords.length > 0) {
        for (const batch of chunk(acceptedRecords, 200)) {
          await acceptDecisions(batch)
        }
      }
      if (others.length > 0) {
        for (const batch of chunk(others, 200)) {
          await appendDecisions(batch)
        }
      }
    } catch (err) {
      setError((err as Error).message)
      await loadAll()
    } finally {
      setLoading(false)
    }
  }

  const recordForCandidate = (
    entry: MatchEntry,
    candidate: MatchCandidate,
    decision: DecisionRecord['decision'],
    method: DecisionRecord['method'],
  ): DecisionRecord => ({
    video_id: entry.video_id,
    chart_song_id: candidate.chart_song_id,
    source_type: candidate.source_type ?? 'unknown',
    decision,
    confidence: candidate.confidence,
    reviewable: decision === 'accepted' ? ruleReviewable(candidate.confidence) : false,
    method,
    run_id: runId,
    timestamp: new Date().toISOString(),
  })

  const saveEdit = async (entry: MatchEntry, candidate: MatchCandidate, original: DecisionRecord) => {
    if (apiStatus !== 'online') return
    const replacement = recordForCandidate(entry, candidate, 'accepted', 'manual')
    setSavingEdit(true)
    try {
      await updateDecision(original.video_id, replacement)
      setDecisions((prev) => prev.map((d) => (d.video_id === original.video_id ? replacement : d)))
      setEditing(null)
    } catch (err) {
      setError((err as Error).message)
      await loadAll()
    } finally {
      setSavingEdit(false)
    }
  }

  const clearDecision = async (videoId: string) => {
    if (apiStatus !== 'online') return
    setSavingEdit(true)
    try {
      await deleteDecision(videoId)
      setDecisions((prev) => prev.filter((d) => d.video_id !== videoId))
      setEditing(null)
    } catch (err) {
      setError((err as Error).message)
      await loadAll()
    } finally {
      setSavingEdit(false)
    }
  }

  const handleBatchAccept = (confidence: 'exact' | 'high' | 'medium') => {
    if (!matches || apiStatus !== 'online') return
    const records: DecisionRecord[] = []
    for (const entry of filteredPending) {
      const best = entry.candidates[0]
      if (!best || best.confidence !== confidence) continue
      records.push(recordForCandidate(entry, best, 'accepted', 'batch'))
    }
    saveDecisions(records)
  }

  const handleRejectSelected = () => {
    if (!matches || apiStatus !== 'online') return
    const records: DecisionRecord[] = []
    for (const entry of filteredPending) {
      if (!selected.has(entry.video_id)) continue
      const best = entry.candidates[0]
      if (!best) continue
      records.push(recordForCandidate(entry, best, 'rejected', 'batch'))
    }
    saveDecisions(records)
  }

  const attachBillboardSong = async (videoId: string, song: BillboardSong) => {
    const record: DecisionRecord = {
      video_id: videoId,
      chart_song_id: song.chart_song_id,
      source_type: 'billboard_hot_100',
      decision: 'accepted',
      confidence: 'exact',
      reviewable: false,
      method: 'manual',
      run_id: runId,
      timestamp: new Date().toISOString(),
      notes: `Manual attach from Billboard search: ${song.artist} — ${song.title}`,
    }
    await saveDecisions([record])
  }

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleCandidateDrawer = (videoId: string) => {
    setExpandedCandidates((prev) => {
      const next = new Set(prev)
      if (next.has(videoId)) next.delete(videoId)
      else next.add(videoId)
      return next
    })
  }

  const toggleMeta = (videoId: string) => {
    setExpandedMeta((prev) => {
      const next = new Set(prev)
      if (next.has(videoId)) next.delete(videoId)
      else next.add(videoId)
      return next
    })
  }

  const runCardSearch = async (videoId: string, limitOverride?: number) => {
    const state = getSearchState(videoId)
    if (!state.query.trim() || apiStatus !== 'online') return
    const limit = limitOverride ?? state.limit
    updateSearchState(videoId, { loading: true, error: null, open: true })
    try {
      const res = await searchBillboardSongs(state.query.trim(), limit)
      setSearchState((prev) => {
        const current = prev[videoId] ?? defaultSearchState
        const seen = new Set(current.results.map((r) => r.chart_song_id))
        const merged = [...current.results]
        for (const song of res.results) {
          if (!seen.has(song.chart_song_id)) merged.push(song)
        }
        return {
          ...prev,
          [videoId]: {
            ...current,
            loading: false,
            total: res.count,
            results: merged,
            error: null,
            open: true,
            cursor: merged.length > 0 ? 0 : -1,
            limit,
          },
        }
      })
    } catch (err) {
      updateSearchState(videoId, { loading: false, error: (err as Error).message })
    }
  }

  const loadMoreResults = async (videoId: string) => {
    const state = getSearchState(videoId)
    const nextLimit = state.limit + 10
    updateSearchState(videoId, { limit: nextLimit })
    await runCardSearch(videoId, nextLimit)
  }

  const handleSearchKey = async (videoId: string, e: React.KeyboardEvent<HTMLInputElement>) => {
    const state = getSearchState(videoId)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.min(state.results.length - 1, Math.max(0, state.cursor + 1))
      updateSearchState(videoId, { cursor: next, open: true })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.max(-1, state.cursor - 1)
      updateSearchState(videoId, { cursor: next })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (state.cursor >= 0 && state.results[state.cursor]) {
        await attachBillboardSong(videoId, state.results[state.cursor])
      } else {
        await runCardSearch(videoId)
      }
    } else if (e.key === 'Escape') {
      updateSearchState(videoId, { open: false, cursor: -1 })
    }
  }

  const handleCardKeyNav = useCallback(
    (e: KeyboardEvent) => {
      if (!matchingMode) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (tab !== 'pending') return
      if (filteredPending.length === 0) return

      if (e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setActiveCardIndex((idx) => Math.min(filteredPending.length - 1, idx + 1))
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setActiveCardIndex((idx) => Math.max(0, idx - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const entry = filteredPending[activeCardIndex]
        const best = entry?.candidates[0]
        if (entry && best) saveDecisions([recordForCandidate(entry, best, 'accepted', 'manual')])
      } else if (e.key === '/') {
        e.preventDefault()
        const entry = filteredPending[activeCardIndex]
        if (entry) searchRefs.current[entry.video_id]?.focus()
      }
    },
    [activeCardIndex, filteredPending, matchingMode, tab],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleCardKeyNav)
    return () => window.removeEventListener('keydown', handleCardKeyNav)
  }, [handleCardKeyNav])

  useEffect(() => {
    const entry = filteredPending[activeCardIndex]
    if (!entry) return
    const ref = cardRefs.current[entry.video_id]
    if (ref) ref.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeCardIndex, filteredPending])

  const confidencePill = (confidence: MatchCandidate['confidence']) => (
    <span
      title={confidenceCopy[confidence]}
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] ${
        confidence === 'exact'
          ? 'bg-emerald-100 text-emerald-800'
          : confidence === 'high'
            ? 'bg-sky-100 text-sky-800'
            : 'bg-amber-100 text-amber-800'
      }`}
    >
      {confidence}
    </span>
  )

  const candidateRow = (entry: MatchEntry, candidate: MatchCandidate) => (
    <div
      key={candidate.chart_song_id}
      className="rounded-xl border border-white/60 bg-white/90 p-3 shadow-inner transition hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-navy">
            <span className="truncate">{candidate.chart_artist} — {candidate.chart_title}</span>
            {confidencePill(candidate.confidence)}
          </div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-navy/50">
            {candidate.best_chart_year || '—'} · score {candidate.score.toFixed(3)}
          </p>
          <p className="text-xs text-navy/70">{candidate.reasons.join('; ')}</p>
        </div>
        <div className="flex flex-col gap-2 text-xs">
          <button
            className="rounded-full bg-navy px-3 py-1 font-semibold text-white shadow disabled:opacity-50"
            disabled={actionsDisabled}
            onClick={() => saveDecisions([recordForCandidate(entry, candidate, 'accepted', 'manual')])}
          >
            Accept
          </button>
          <button
            className="rounded-full border border-coral px-3 py-1 font-semibold text-coral shadow disabled:opacity-50"
            disabled={actionsDisabled}
            onClick={() => saveDecisions([recordForCandidate(entry, candidate, 'rejected', 'manual')])}
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  )

  const renderSearchResults = (entry: MatchEntry) => {
    const state = getSearchState(entry.video_id)
    if (!state.open && state.results.length === 0 && !state.loading) return null
    const moreAvailable = state.total !== null && state.results.length < state.total
    return (
      <div
        className="relative mt-2 max-h-52 overflow-y-auto rounded-xl border border-white/60 bg-white/90 p-2 shadow-inner"
        onScroll={(e) => {
          const el = e.currentTarget
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 12 && moreAvailable) {
            loadMoreResults(entry.video_id)
          }
        }}
      >
        <div className="flex items-center justify-between text-xs text-navy/60 px-1 pb-1">
          <span>Showing {state.results.length}{state.total !== null ? ` of ${state.total}` : ''} results</span>
          {state.loading && <span>Loading…</span>}
        </div>
        {state.error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{state.error}</div>}
        {!state.loading && state.results.length === 0 && !state.error && (
          <div className="rounded-lg bg-white px-3 py-2 text-xs text-navy/60">No results yet for “{state.query}”.</div>
        )}
        {state.results.map((song, idx) => {
          const active = idx === state.cursor
          return (
            <div
              key={song.chart_song_id}
              className={`mt-1 flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active ? 'bg-navy/10 ring-1 ring-navy/50' : 'bg-white'
              }`}
            >
              <div className="flex-1">
                <p className="font-semibold text-navy truncate">{song.artist} — {song.title}</p>
                <p className="text-[11px] uppercase tracking-[0.14em] text-navy/60">
                  {song.first_chart_year ?? '—'}–{song.last_chart_year ?? '—'} · peak {song.peak_position ?? '—'}
                </p>
              </div>
              <button
                className="rounded-full bg-mint px-3 py-1 text-xs font-semibold text-navy shadow disabled:opacity-50"
                disabled={actionsDisabled}
                onClick={() => attachBillboardSong(entry.video_id, song)}
              >
                Attach
              </button>
            </div>
          )
        })}
        {moreAvailable && (
          <div className="mt-2 flex justify-center">
            <button
              className="rounded-full border border-navy px-3 py-1 text-xs font-semibold text-navy shadow disabled:opacity-50"
              disabled={actionsDisabled || state.loading}
              onClick={() => loadMoreResults(entry.video_id)}
            >
              Load more
            </button>
          </div>
        )}
      </div>
    )
  }

  const pendingCard = (entry: MatchEntry, index: number) => {
    const best = entry.candidates[0]
    const isActive = tab === 'pending' && index === activeCardIndex
    const metaExpanded = expandedMeta.has(entry.video_id)
    const candidatesOpen = expandedCandidates.has(entry.video_id)

    const clampedStyle: React.CSSProperties | undefined = metaExpanded
      ? undefined
      : {
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }

    return (
      <div
        key={entry.video_id}
        ref={(el) => {
          cardRefs.current[entry.video_id] = el
        }}
        className={`rounded-2xl border bg-white/90 p-4 shadow-sm transition ${
          isActive ? 'border-navy shadow-retro' : 'border-white/70 hover:-translate-y-0.5 hover:shadow-retro-soft'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-coral"
              checked={selected.has(entry.video_id)}
              onChange={() => toggleSelected(entry.video_id)}
            />
            <div>
              <p className="text-sm font-semibold text-navy" style={clampedStyle}>
                {entry.video_artist || 'Unknown'} — {entry.video_title || 'Untitled'}
              </p>
              <button
                className="text-[11px] uppercase tracking-[0.16em] text-navy/60 underline decoration-dotted"
                onClick={() => toggleMeta(entry.video_id)}
              >
                {metaExpanded ? 'Collapse metadata' : 'Expand metadata'}
              </button>
              <p className="text-xs text-navy/60">{entry.video_id}</p>
            </div>
          </label>
          {best && confidencePill(best.confidence)}
        </div>

        <div className="mt-2 rounded-xl bg-navy/5 px-3 py-2 text-xs text-navy/80">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-navy">Top candidate</span>
            <div className="flex gap-2 text-[11px] uppercase tracking-[0.16em] text-navy/60">
              <span>{best ? `Score ${best.score.toFixed(3)}` : 'None'}</span>
              <span>{entry.candidates.length} suggestions</span>
            </div>
          </div>
          {best ? (
            <div className="mt-1 text-sm text-navy">
              <div className="flex items-center gap-2">
                <span className="font-semibold truncate">{best.chart_artist} — {best.chart_title} ({best.best_chart_year || '—'})</span>
                {confidencePill(best.confidence)}
              </div>
              <p className="text-xs text-navy/60">{best.reasons.join('; ')}</p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-navy/60">No candidates for this video.</p>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <button
            className="rounded-full bg-navy px-3 py-1 font-semibold text-white shadow disabled:opacity-50"
            disabled={actionsDisabled || !best}
            onClick={() => best && saveDecisions([recordForCandidate(entry, best, 'accepted', 'manual')])}
          >
            Accept best
          </button>
          <button
            className="rounded-full border border-coral px-3 py-1 font-semibold text-coral shadow disabled:opacity-50"
            disabled={actionsDisabled || !best}
            onClick={() => best && saveDecisions([recordForCandidate(entry, best, 'rejected', 'manual')])}
          >
            Reject best
          </button>
          <button
            className="rounded-full border border-navy px-3 py-1 text-xs font-semibold text-navy shadow disabled:opacity-50"
            onClick={() => toggleCandidateDrawer(entry.video_id)}
          >
            {candidatesOpen ? 'Hide candidates' : 'View candidates'}
          </button>
          <span className="text-[11px] uppercase tracking-[0.16em] text-navy/50">
            {best ? 'Enter = accept · / = search' : 'No quick accept'}
          </span>
        </div>

        {candidatesOpen && (
          <div className="mt-3 space-y-2">
            {entry.candidates.map((c) => candidateRow(entry, c))}
          </div>
        )}

        <div className="mt-3 rounded-xl border border-white/70 bg-navy/5 px-3 py-3 shadow-inner">
          <div className="flex items-center justify-between gap-2">
            <label className="flex-1 text-xs font-semibold uppercase tracking-[0.16em] text-navy/60">
              Billboard search
              <input
                ref={(el) => {
                  searchRefs.current[entry.video_id] = el
                }}
                value={getSearchState(entry.video_id).query}
                onChange={(e) => updateSearchState(entry.video_id, { query: e.target.value })}
                onKeyDown={(e) => handleSearchKey(entry.video_id, e)}
                placeholder="Artist / title for this video…"
                className="mt-1 w-full rounded-full border border-white/70 bg-white px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-coral"
              />
            </label>
            <div className="flex flex-col items-end gap-1 text-right">
              <button
                className="rounded-full bg-navy px-3 py-2 text-sm font-semibold text-white shadow disabled:opacity-50"
                disabled={actionsDisabled || !getSearchState(entry.video_id).query.trim()}
                onClick={() => runCardSearch(entry.video_id)}
              >
                {getSearchState(entry.video_id).loading ? 'Searching…' : 'Search'}
              </button>
              {getSearchState(entry.video_id).total !== null && (
                <span className="text-[11px] uppercase tracking-[0.14em] text-navy/60">
                  {getSearchState(entry.video_id).total} total
                </span>
              )}
            </div>
          </div>
          {renderSearchResults(entry)}
        </div>
      </div>
    )
  }

  const replaceSelector = (entry: MatchEntry, onSelect: (c: MatchCandidate) => void) => (
    <select
      className="rounded-full bg-white/80 px-3 py-1 text-sm text-navy"
      disabled={actionsDisabled}
      onChange={(e) => {
        const chosen = entry.candidates.find((c) => c.chart_song_id === e.target.value)
        if (chosen) onSelect(chosen)
      }}
      defaultValue=""
    >
      <option value="" disabled>
        Choose candidate…
      </option>
      {entry.candidates.map((c) => (
        <option key={c.chart_song_id} value={c.chart_song_id}>
          {c.chart_artist} — {c.chart_title} ({c.confidence})
        </option>
      ))}
    </select>
  )

  const acceptedCard = (record: DecisionRecord, reviewableFlag: boolean) => {
    const entry = matches?.matches.find((m) => m.video_id === record.video_id)
    return (
      <div key={record.timestamp + record.video_id} className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-navy">{entry?.video_artist || 'Unknown'} — {entry?.video_title || 'Untitled'}</p>
            <p className="text-xs text-navy/60">{record.video_id}</p>
            <p className="text-sm text-navy">
              → {record.chart_song_id} ({record.confidence}) {reviewableFlag && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Reviewable</span>}
            </p>
          </div>
          <div className="text-xs text-navy/60 text-right">
            {record.method} · {new Date(record.timestamp).toLocaleString()}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {reviewableFlag && (
            <button
              className="rounded-full bg-navy px-3 py-1 text-white shadow"
              onClick={() =>
                saveDecisions([
                  { ...record, reviewable: false, timestamp: new Date().toISOString(), method: 'manual' as const, decision: 'accepted' },
                ])
              }
              disabled={actionsDisabled}
            >
              Promote to confirmed
            </button>
          )}
          {entry && (
            <button
              className="rounded-full bg-navy/80 px-3 py-1 text-white shadow"
              onClick={() => setEditing({ record, entry, selectedId: record.chart_song_id, search: '' })}
              disabled={actionsDisabled}
            >
              Edit
            </button>
          )}
          <button
            className="rounded-full border border-coral px-3 py-1 text-coral shadow"
            onClick={() =>
              saveDecisions([
                { ...record, decision: 'revoked', reviewable: false, timestamp: new Date().toISOString(), method: 'manual' },
              ])
            }
            disabled={actionsDisabled}
          >
            Revoke
          </button>
          {entry &&
            replaceSelector(entry, (candidate) =>
              saveDecisions([recordForCandidate(entry, candidate, 'accepted', 'manual')]),
            )}
        </div>
      </div>
    )
  }

  return (
    <section className="space-y-5">
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 px-4 py-7">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-2xl md:p-6">
            <div className="flex items-start justify-between gap-3.5">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-navy/60">Editing accepted match</p>
                <h2 className="text-2xl font-semibold text-navy">
                  {editing.entry.video_artist || 'Unknown'} — {editing.entry.video_title || 'Untitled'}
                </h2>
                <p className="text-sm text-navy/60">{editing.record.video_id}</p>
                <p className="mt-2 text-sm text-navy">
                  Current: {editing.record.chart_song_id} ({editing.record.confidence})
                </p>
              </div>
              <button
                className="rounded-full border border-navy px-3 py-1 text-sm font-semibold text-navy"
                onClick={() => !savingEdit && setEditing(null)}
              >
                Close
              </button>
            </div>

            <div className="mt-3.5 flex flex-col gap-3 rounded-xl bg-navy/5 p-3.5">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <label className="flex items-center gap-2 text-sm text-navy">
                  <span className="text-xs uppercase tracking-[0.16em] text-navy/60">Search candidates</span>
                  <input
                    value={editing.search}
                    onChange={(e) => setEditing((prev) => (prev ? { ...prev, search: e.target.value } : prev))}
                    className="w-56 rounded-full border border-white/70 bg-white px-3 py-1.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-coral"
                    placeholder="Artist, title, id…"
                  />
                </label>
                <div className="text-xs text-navy/70">Run {runId}</div>
              </div>

              <div className="grid max-h-80 gap-2 overflow-y-auto rounded-lg bg-white/60 p-2">
                {editing.entry.candidates
                  .filter((c) => {
                    const q = editing.search.toLowerCase()
                    if (!q) return true
                    return (
                      c.chart_artist.toLowerCase().includes(q) ||
                      c.chart_title.toLowerCase().includes(q) ||
                      c.chart_song_id.toLowerCase().includes(q)
                    )
                  })
                  .map((c) => (
                    <label
                      key={c.chart_song_id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                        editing.selectedId === c.chart_song_id ? 'border-navy bg-navy/5' : 'border-white/70 bg-white/70'
                      }`}
                    >
                      <input
                        type="radio"
                        name="candidate"
                        className="mt-1 accent-coral"
                        checked={editing.selectedId === c.chart_song_id}
                        onChange={() =>
                          setEditing((prev) => (prev ? { ...prev, selectedId: c.chart_song_id } : prev))
                        }
                      />
                      <div className="flex-1">
                        <p className="font-semibold text-navy">
                          {c.chart_artist} — {c.chart_title} ({c.best_chart_year || '—'})
                        </p>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-navy/60">
                          {c.confidence} · score {c.score.toFixed(3)}
                        </p>
                        <p className="text-xs text-navy/70">{c.reasons.join('; ')}</p>
                      </div>
                    </label>
                  ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-50"
                  disabled={savingEdit || !editing.selectedId || actionsDisabled}
                  onClick={() => {
                    const candidate = editing.entry.candidates.find((c) => c.chart_song_id === editing.selectedId)
                    if (candidate) saveEdit(editing.entry, candidate, editing.record)
                  }}
                >
                  Save change
                </button>
                <button
                  className="rounded-full border border-coral px-4 py-2 text-sm font-semibold text-coral shadow disabled:opacity-50"
                  disabled={savingEdit || actionsDisabled}
                  onClick={() => clearDecision(editing.record.video_id)}
                >
                  Clear decision (return to Pending)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-navy/70">Match Inspector</p>
          <h1 className="text-3xl font-semibold text-navy">RetroVerse Match Decisions</h1>
          <p className="text-sm text-navy/70">
            Run {matches?.meta.run_id ?? '—'} · {matches?.meta.generated_at ? new Date(matches.meta.generated_at).toLocaleString() : '—'} · Ledger entries: {decisions.length}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white shadow"
            onClick={() => loadAll()}
            disabled={actionsDisabled}
          >
            {loading ? 'Refreshing…' : 'Refresh latest run'}
          </button>
          <button
            className={`rounded-full px-4 py-2 text-sm font-semibold shadow ${matchingMode ? 'bg-emerald-600 text-white' : 'bg-white text-navy'}`}
            onClick={() => setMatchingMode((prev) => !prev)}
          >
            {matchingMode ? 'Matching Mode: ON (J/K/Enter/ /)' : 'Enable Matching Mode'}
          </button>
          {overview && (
            <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-navy shadow">
              Unmatched: {overview.unmatched ?? '—'}
            </span>
          )}
        </div>
      </div>

      {apiStatus === 'offline' && (
        <div className="rounded-xl bg-amber-100 p-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-300">
          API offline — run <code className="rounded bg-white/70 px-2 py-0.5">npm run api</code>
        </div>
      )}

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap gap-2 text-sm">
        <button
          className={`rounded-full px-3 py-1 font-semibold shadow ${tab === 'pending' ? 'bg-navy text-white' : 'bg-white text-navy'}`}
          onClick={() => setTab('pending')}
        >
          Pending ({filteredPending.length})
        </button>
        <button
          className={`rounded-full px-3 py-1 font-semibold shadow ${tab === 'accepted' ? 'bg-navy text-white' : 'bg-white text-navy'}`}
          onClick={() => setTab('accepted')}
        >
          Accepted ({accepted.length})
        </button>
        <button
          className={`rounded-full px-3 py-1 font-semibold shadow ${tab === 'reviewable' ? 'bg-navy text-white' : 'bg-white text-navy'}`}
          onClick={() => setTab('reviewable')}
        >
          Reviewable ({reviewable.length})
        </button>
      </div>

      {tab === 'pending' && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/80 p-2.5 shadow">
            <input
              value={queueFilter}
              onChange={(e) => setQueueFilter(e.target.value)}
              placeholder="Filter queue by artist, title, id, or candidate…"
              className="flex-1 rounded-full border border-white/70 bg-navy/5 px-3 py-1.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-coral"
            />
            <div className="relative">
              <button
                className="rounded-full border border-navy px-3 py-2 text-sm font-semibold text-navy shadow"
                onClick={() => setBatchMenuOpen((prev) => !prev)}
              >
                Batch tools ▾
              </button>
              {batchMenuOpen && (
                <div className="absolute right-0 z-10 mt-2 w-60 space-y-2 rounded-xl border border-white/70 bg-white p-3 text-sm shadow-lg">
                  <button
                    className="flex w-full items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 font-semibold text-emerald-800"
                    onClick={() => {
                      setBatchMenuOpen(false)
                      handleBatchAccept('exact')
                    }}
                    disabled={actionsDisabled}
                  >
                    Accept all EXACT
                    <span className="text-[11px] uppercase tracking-[0.16em]">auto</span>
                  </button>
                  <button
                    className="flex w-full items-center justify-between rounded-lg bg-sky-50 px-3 py-2 font-semibold text-sky-800"
                    onClick={() => {
                      setBatchMenuOpen(false)
                      handleBatchAccept('high')
                    }}
                    disabled={actionsDisabled}
                  >
                    Accept all HIGH
                    <span className="text-[11px] uppercase tracking-[0.16em]">auto</span>
                  </button>
                  <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-amber-600"
                          checked={acceptMediumArmed}
                          onChange={(e) => setAcceptMediumArmed(e.target.checked)}
                        />
                        Accept all MEDIUM
                      </label>
                      <button
                        className="rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white shadow disabled:opacity-50"
                        disabled={!acceptMediumArmed || actionsDisabled}
                        onClick={() => {
                          setBatchMenuOpen(false)
                          handleBatchAccept('medium')
                        }}
                      >
                        Run
                      </button>
                    </div>
                    <p className="mt-1 text-xs">Flagged as reviewable when accepted.</p>
                  </div>
                  <button
                    className="flex w-full items-center justify-between rounded-lg bg-red-50 px-3 py-2 font-semibold text-red-700 disabled:opacity-50"
                    disabled={selected.size === 0 || actionsDisabled}
                    onClick={() => {
                      setBatchMenuOpen(false)
                      handleRejectSelected()
                    }}
                  >
                    Reject selected
                    <span className="text-[11px] uppercase tracking-[0.16em]">{selected.size}</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-3">
            {filteredPending.map((entry, idx) => pendingCard(entry, idx))}
            {filteredPending.length === 0 && (
              <div className="rounded-xl bg-white/70 p-4 text-sm text-navy/70">No pending items for this run.</div>
            )}
          </div>
        </div>
      )}

      {tab === 'accepted' && (
        <div className="grid gap-3">
          {accepted.map((rec) => acceptedCard(rec, false))}
          {accepted.length === 0 && <div className="rounded-xl bg-white/70 p-4 text-sm text-navy/70">No accepted matches yet.</div>}
        </div>
      )}

      {tab === 'reviewable' && (
        <div className="grid gap-3">
          {reviewable.map((rec) => acceptedCard(rec, true))}
          {reviewable.length === 0 && (
            <div className="rounded-xl bg-white/70 p-4 text-sm text-navy/70">No reviewable items yet.</div>
          )}
        </div>
      )}
    </section>
  )
}
