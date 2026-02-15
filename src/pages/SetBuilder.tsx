import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import logoMark from '../assets/round-logo.png'
import { usePlaylistContext } from '../context/PlaylistContext'
import { formatDuration, formatYear, loadVideoIndex, type VideoRecord } from '../lib/videoIndex'
import historyIndexUrl from '../../artifacts/output/history-index.json?url'
import {
  TIER_COLORS,
  YEAR_DOMAIN_MAX,
  YEAR_DOMAIN_MIN,
  angleToYear,
  clamp,
  indexToAngle,
  recencyLabel,
  spanLabel,
  tierLabel,
  type PlayTierId,
  type TierSelection,
} from './setBuilderUtils'
import { useConcentricRings } from './useConcentricRings'
import './SetBuilder.css'

const SCRAMBLE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#!?'

const TIER_RING_OPTIONS: Array<{ id: TierSelection; label: string }> = [
  { id: 'promo', label: 'Promo' },
  { id: 'light', label: 'Light' },
  { id: 'medium', label: 'Medium' },
  { id: 'heavy', label: 'Heavy' },
  { id: 'power', label: 'Power' },
  { id: 'mixed', label: 'Mixed' },
]

const scrambleValue = (value: string) =>
  Array.from(value, (character) => {
    if (character === ' ' || character === '→' || character === ':') return character
    return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
  }).join('')

const parseAddedAt = (row: VideoRecord): number | null => {
  if (row.firstSeenMs) return row.firstSeenMs
  if (row.addedAt) {
    const ms = new Date(row.addedAt).getTime()
    if (Number.isFinite(ms)) return ms
  }
  return null
}

const weightedPick = (
  items: VideoRecord[],
  count: number,
  intensity: number,
  historyWeights: Record<string, number>,
): VideoRecord[] => {
  const available = [...items]
  const picks: VideoRecord[] = []

  while (available.length > 0 && picks.length < count) {
    const weights = available.map((item) => {
      const libraryPlays = Math.max(0, item.playcount)
      const historyPlays = Math.max(0, historyWeights[item.filePath] ?? historyWeights[item.id] ?? 0)
      const combinedPlays = libraryPlays + historyPlays
      const novelty = 1 / (1 + combinedPlays)
      const retention = clamp(item.retentionScore / 100, 0, 1)
      const retentionBias = 0.65 + retention * 1.1
      return retentionBias * (1 + intensity * Math.random() + novelty * (intensity / 2))
    })

    const total = weights.reduce((sum, value) => sum + value, 0)
    let cursor = Math.random() * total
    let selected = 0

    for (let index = 0; index < weights.length; index += 1) {
      cursor -= weights[index]
      if (cursor <= 0) {
        selected = index
        break
      }
    }

    picks.push(available[selected])
    available.splice(selected, 1)
  }

  return picks
}

export default function SetBuilder() {
  const { addManyToQueue, replaceQueue, openPlayer } = usePlaylistContext()

  const [rows, setRows] = useState<VideoRecord[]>([])
  const [historyWeights, setHistoryWeights] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedGenre, setSelectedGenre] = useState('all')
  const [preview, setPreview] = useState<VideoRecord[]>([])
  const [rerollTick, setRerollTick] = useState(0)
  const [crtScrambling, setCrtScrambling] = useState(false)
  const [crtDisplay, setCrtDisplay] = useState({
    range: '1980 → 1990',
    span: '5y',
    tier: 'MIXED',
    recency: 'ALL',
    matches: '0',
  })

  const rings = useConcentricRings({
    initialYear: 1980,
    initialSpan: 5,
    initialEraId: 'none',
    initialTier: 'mixed',
    initialCount: 20,
    initialRecency: 'all',
  })

  const yearRingRef = useRef<HTMLDivElement | null>(null)
  const activeYearPointerRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await loadVideoIndex()
        if (!cancelled) setRows(data)
      } catch (err) {
        if (!cancelled) setError((err as Error).message || 'Load error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    fetch(historyIndexUrl)
      .then((response) => (response.ok ? response.json() : null))
      .then((history) => {
        if (cancelled || !history?.perSong || typeof history.perSong !== 'object') return

        const weights: Record<string, number> = {}
        for (const [songKey, stats] of Object.entries(history.perSong as Record<string, { totalPlays?: unknown }>)) {
          const plays = typeof stats?.totalPlays === 'number' ? stats.totalPlays : 0
          const normalized = songKey.replace(/\\/g, '/')
          const videoMarker = normalized.toUpperCase().indexOf('/VIDEO/')

          if (videoMarker >= 0) {
            const rel = `/VIDEO/${normalized.slice(videoMarker + '/VIDEO/'.length)}`.replace(/\\/g, '/')
            weights[rel] = Math.max(weights[rel] ?? 0, plays)
          }

          weights[songKey] = Math.max(weights[songKey] ?? 0, plays)
        }

        setHistoryWeights(weights)
      })
      .catch(() => {
        if (!cancelled) setHistoryWeights({})
      })

    return () => {
      cancelled = true
    }
  }, [])

  const genres = useMemo(() => {
    const set = new Set<string>()
    for (const row of rows) {
      if (row.genre && row.genre !== '—') set.add(row.genre)
    }
    return [...set].sort((left, right) => left.localeCompare(right))
  }, [rows])

  const activeTierIds = useMemo(() => new Set(rings.activeTierIds), [rings.activeTierIds])

  const filtered = useMemo(() => {
    const nowMs = Date.now()
    const effectiveRange = rings.effectiveRange
    if (!effectiveRange) return []

    return rows.filter((row) => {
      const rowTier = row.tier ? row.tier.toLowerCase() : ''
      if (!activeTierIds.has(rowTier as PlayTierId)) return false

      if (typeof row.year !== 'number') return false
      if (row.year < effectiveRange.start || row.year > effectiveRange.end) return false

      if (rings.selectedRecency !== 'all') {
        const days = rings.selectedRecency === '7d' ? 7 : rings.selectedRecency === '30d' ? 30 : 90
        const timestamp = parseAddedAt(row)
        if (!timestamp) return false
        if (timestamp < nowMs - days * 24 * 60 * 60 * 1000) return false
      }

      if (selectedGenre !== 'all' && row.genre !== selectedGenre) return false

      return true
    })
  }, [activeTierIds, rings.effectiveRange, rings.selectedRecency, rows, selectedGenre])

  useEffect(() => {
    const next = weightedPick(filtered, clamp(rings.selectedCount, 1, 50), 5, historyWeights)
    setPreview(next)
  }, [filtered, historyWeights, rerollTick, rings.selectedCount])

  const crtRangeValue = rings.effectiveRange
    ? `${rings.effectiveRange.start} → ${rings.effectiveRange.end}`
    : `${rings.spanWindow.start} → ${rings.spanWindow.end}`
  const crtSpanValue = rings.selectedSpan === 'FULL' ? 'FULL' : `${rings.selectedSpan}y`
  const crtTierValue = tierLabel(rings.selectedTier)
  const crtRecencyValue = recencyLabel(rings.selectedRecency)
  const crtMatchesValue = loading ? '...' : String(filtered.length)

  useEffect(() => {
    let tick = 0
    let settleTimer = 0

    setCrtScrambling(true)

    const timer = window.setInterval(() => {
      tick += 1
      if (tick < 7) {
        setCrtDisplay({
          range: scrambleValue(crtRangeValue),
          span: scrambleValue(crtSpanValue),
          tier: scrambleValue(crtTierValue),
          recency: scrambleValue(crtRecencyValue),
          matches: scrambleValue(crtMatchesValue),
        })
        return
      }

      window.clearInterval(timer)
      setCrtDisplay({
        range: crtRangeValue,
        span: crtSpanValue,
        tier: crtTierValue,
        recency: crtRecencyValue,
        matches: crtMatchesValue,
      })
      settleTimer = window.setTimeout(() => setCrtScrambling(false), 180)
    }, 52)

    return () => {
      window.clearInterval(timer)
      window.clearTimeout(settleTimer)
    }
  }, [crtMatchesValue, crtRangeValue, crtRecencyValue, crtSpanValue, crtTierValue])

  const updateYearFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const node = yearRingRef.current
      if (!node) return

      const bounds = node.getBoundingClientRect()
      const centerX = bounds.left + bounds.width / 2
      const centerY = bounds.top + bounds.height / 2

      const rawAngle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI)
      const ringAngle = rawAngle + 90
      const snappedYear = angleToYear(ringAngle)
      rings.setSelectedYear(snappedYear)
    },
    [rings],
  )

  const onYearPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      activeYearPointerRef.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
      updateYearFromPointer(event.clientX, event.clientY)
    },
    [updateYearFromPointer],
  )

  const onYearPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (activeYearPointerRef.current !== event.pointerId) return
      updateYearFromPointer(event.clientX, event.clientY)
    },
    [updateYearFromPointer],
  )

  const onYearPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (activeYearPointerRef.current !== event.pointerId) return
    activeYearPointerRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  const handleGenerate = useCallback(() => {
    setRerollTick((value) => value + 1)
  }, [])

  const handleAddToQueue = useCallback(() => {
    addManyToQueue(preview)
  }, [addManyToQueue, preview])

  const handleReplaceQueue = useCallback(() => {
    replaceQueue(preview)
  }, [preview, replaceQueue])

  const queueActionDisabled = preview.length === 0

  const summaryRangeLabel = rings.effectiveRange
    ? `${rings.effectiveRange.start} → ${rings.effectiveRange.end}`
    : `${rings.spanWindow.start} → ${rings.spanWindow.end}`

  const eraSummaryLabel = rings.selectedEra.id === 'none'
    ? 'NONE'
    : `${rings.selectedEra.label.toUpperCase()} (${rings.selectedEra.start}–${rings.selectedEra.end})`

  const yearTicks = useMemo(
    () => Array.from({ length: Math.floor((YEAR_DOMAIN_MAX - YEAR_DOMAIN_MIN) / 10) + 1 }, (_, index) => YEAR_DOMAIN_MIN + index * 10),
    [],
  )

  const consoleStyle = useMemo(
    () => ({
      '--sb-tier-accent': rings.tierAccentColor,
      '--sb-tier-surface': TIER_COLORS[rings.selectedTier],
    }) as CSSProperties,
    [rings.selectedTier, rings.tierAccentColor],
  )

  return (
    <section className="stack random-page">
      {error && <div className="placeholder-box">Failed to load: {error}</div>}

      <div className="sb-console" style={consoleStyle}>
        <header className={`sb-crt ${crtScrambling ? 'is-scrambling' : ''}`} aria-live="polite">
          <div className="sb-crt-frame">
            <div className="sb-crt-screen">
              <div className="sb-crt-scanlines" aria-hidden />
              <div className="sb-crt-content">
                <p className="sb-crt-title">SET BUILDER</p>
                <p className="sb-crt-line">TIME RANGE: {crtDisplay.range} <span aria-hidden>•</span> SPAN: {crtDisplay.span}</p>
                <p className="sb-crt-line">TIER: {crtDisplay.tier} <span aria-hidden>•</span> RECENCY: {crtDisplay.recency} <span aria-hidden>•</span> MATCHES: {crtDisplay.matches}</p>
              </div>
            </div>
          </div>
        </header>

        <section className="sb-concentric-panel" aria-label="Set Builder concentric controls">
          <div className="sb-ring-arena">
            <div
              ref={yearRingRef}
              className="sb-ring sb-ring--year"
              onPointerDown={onYearPointerDown}
              onPointerMove={onYearPointerMove}
              onPointerUp={onYearPointerUp}
              onPointerCancel={onYearPointerUp}
              role="slider"
              aria-valuemin={YEAR_DOMAIN_MIN}
              aria-valuemax={YEAR_DOMAIN_MAX}
              aria-valuenow={rings.selectedYear}
              aria-label="Year selector"
            >
              <span className="sb-ring-bezel" aria-hidden />
              <span className="sb-ring-label">YEAR SELECTOR</span>
              <span className="sb-ring-pointer" style={{ '--ring-angle': `${rings.yearAngle}deg` } as CSSProperties} aria-hidden>
                <span className="sb-ring-pointer-head" />
              </span>
              <span className="sb-ring-value">{rings.selectedYear}</span>
              <div className="sb-ring-markers" aria-hidden>
                {yearTicks.map((tick, index) => (
                  <span
                    key={tick}
                    className="sb-ring-marker"
                    style={{ '--ring-angle': `${indexToAngle(index, yearTicks.length)}deg` } as CSSProperties}
                  >
                    {String(tick).slice(2)}
                  </span>
                ))}
              </div>
            </div>

            <div className="sb-ring sb-ring--span" aria-label="Span selector">
              <span className="sb-ring-bezel" aria-hidden />
              <span className="sb-ring-label">SPAN SELECTOR</span>
              <span className="sb-ring-pointer sb-ring-pointer--secondary" style={{ '--ring-angle': `${rings.spanAngle}deg` } as CSSProperties} aria-hidden>
                <span className="sb-ring-pointer-head" />
              </span>
              {rings.spanOptions.map((span, index) => (
                <button
                  key={span}
                  type="button"
                  className={`sb-ring-chip ${rings.selectedSpan === span ? 'is-active' : ''}`}
                  style={{ '--ring-angle': `${indexToAngle(index, rings.spanOptions.length)}deg` } as CSSProperties}
                  onClick={() => rings.setSelectedSpan(span)}
                >
                  {spanLabel(span)}
                </button>
              ))}
            </div>

            <div className="sb-ring sb-ring--era" aria-label="Era selector">
              <span className="sb-ring-bezel" aria-hidden />
              <span className="sb-ring-label">ERA FILTER</span>
              <span className="sb-ring-pointer sb-ring-pointer--secondary" style={{ '--ring-angle': `${rings.eraAngle}deg` } as CSSProperties} aria-hidden>
                <span className="sb-ring-pointer-head" />
              </span>
              {rings.eraOptions.map((era, index) => (
                <button
                  key={era.id}
                  type="button"
                  className={`sb-ring-chip sb-ring-chip--era ${rings.selectedEraId === era.id ? 'is-active' : ''}`}
                  style={{ '--ring-angle': `${indexToAngle(index, rings.eraOptions.length)}deg` } as CSSProperties}
                  onClick={() => rings.setSelectedEraId(era.id)}
                >
                  {era.label}
                </button>
              ))}
            </div>

            <div className="sb-ring sb-ring--tier" aria-label="Rotation tier selector">
              <span className="sb-ring-bezel" aria-hidden />
              <span className="sb-ring-label">ROTATION TIER</span>
              <span className="sb-ring-pointer sb-ring-pointer--secondary" style={{ '--ring-angle': `${rings.tierAngle}deg` } as CSSProperties} aria-hidden>
                <span className="sb-ring-pointer-head" />
              </span>
              {TIER_RING_OPTIONS.map((tier, index) => (
                <button
                  key={tier.id}
                  type="button"
                  className={`sb-ring-chip sb-ring-chip--tier ${rings.selectedTier === tier.id ? 'is-active' : ''}`}
                  style={{
                    '--ring-angle': `${indexToAngle(index, TIER_RING_OPTIONS.length)}deg`,
                    '--chip-tier-color': TIER_COLORS[tier.id],
                  } as CSSProperties}
                  onClick={() => rings.setSelectedTier(tier.id)}
                >
                  {tier.label}
                </button>
              ))}
            </div>

            <div className="sb-ring sb-ring--count" aria-label="Count selector">
              <span className="sb-core-watermark" aria-hidden>
                <img src={logoMark} alt="" />
              </span>
              <span className="sb-ring-pointer sb-ring-pointer--core" style={{ '--ring-angle': `${rings.countAngle}deg` } as CSSProperties} aria-hidden>
                <span className="sb-ring-pointer-head" />
              </span>
              {rings.countOptions.map((count, index) => (
                <button
                  key={count}
                  type="button"
                  className={`sb-core-chip ${rings.selectedCount === count ? 'is-active' : ''}`}
                  style={{ '--ring-angle': `${indexToAngle(index, rings.countOptions.length)}deg` } as CSSProperties}
                  onClick={() => rings.setSelectedCount(count)}
                >
                  {count}
                </button>
              ))}
              <span className="sb-core-value">{rings.selectedCount}</span>
              <span className="sb-ring-label sb-ring-label--core">COUNT SELECTOR</span>
            </div>
          </div>
        </section>

        <section className="sb-summary-panel">
          <h2 className="sb-summary-title">Set Summary</h2>
          <dl className="sb-summary-grid">
            <div>
              <dt>YEAR RANGE</dt>
              <dd>{summaryRangeLabel}</dd>
            </div>
            <div>
              <dt>SPAN</dt>
              <dd>{rings.selectedSpan === 'FULL' ? 'FULL' : `${rings.selectedSpan} YEARS`}</dd>
            </div>
            <div>
              <dt>ERA</dt>
              <dd>{eraSummaryLabel}</dd>
            </div>
            <div>
              <dt>TIER</dt>
              <dd>{tierLabel(rings.selectedTier)}</dd>
            </div>
            <div>
              <dt>RECENCY</dt>
              <dd>{recencyLabel(rings.selectedRecency)}</dd>
            </div>
            <div>
              <dt>COUNT</dt>
              <dd>{rings.selectedCount}</dd>
            </div>
            <div>
              <dt>MATCHES</dt>
              <dd>{loading ? '...' : filtered.length}</dd>
            </div>
          </dl>
          {!rings.hasEraOverlap && <p className="sb-era-note">Era outside selected range - widen span.</p>}

          <div className="sb-summary-controls">
            <div className="sb-recency-group" role="group" aria-label="Recency filter">
              {rings.recencyOptions.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`sb-recency-chip ${rings.selectedRecency === value ? 'is-active' : ''}`}
                  onClick={() => rings.setSelectedRecency(value)}
                >
                  {value === 'all' ? 'All' : value}
                </button>
              ))}
            </div>

            <label className="sb-genre-select-wrap">
              <span>GENRE</span>
              <select value={selectedGenre} onChange={(event) => setSelectedGenre(event.target.value)}>
                <option value="all">All genres</option>
                {genres.map((genre) => (
                  <option key={genre} value={genre}>
                    {genre}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="sb-output-panel">
          <p className="sb-output-note">OUTPUT ACTIONS</p>
          <div className="sb-output-buttons">
            <button type="button" className="sb-action-button" onClick={handleGenerate}>
              Generate
            </button>
            <button type="button" className="sb-action-button" onClick={handleAddToQueue} disabled={queueActionDisabled}>
              Add Queue
            </button>
            <button type="button" className="sb-action-button" onClick={handleReplaceQueue} disabled={queueActionDisabled}>
              Replace Queue
            </button>
          </div>
        </section>

        <section className="sb-preview-panel">
          <div className="sb-preview-head">
            <h2 className="sb-preview-title">Preview</h2>
            <span className="muted sb-preview-count">{loading ? 'Loading...' : `${filtered.length} matches`}</span>
          </div>

          <div className="sb-preview-list">
            {preview.map((row) => (
              <article key={row.id} className="sb-preview-row">
                <button
                  type="button"
                  className="sb-preview-thumb"
                  onClick={() => row.videoUrl && openPlayer(row, { preferQueue: true })}
                  disabled={!row.videoUrl}
                  aria-label={row.videoUrl ? `Play ${row.title}` : `${row.title} unavailable`}
                >
                  {row.thumbnailUrl ? <img src={row.thumbnailUrl} alt="" loading="lazy" /> : <div className="thumb-placeholder" />}
                </button>
                <div className="sb-preview-text">
                  <strong>{row.title}</strong>
                  <span>
                    {row.artist} · {formatYear(row.year)} · {formatDuration(row.durationSec)} · Retention {row.retentionScore} ({row.retentionGrade})
                  </span>
                </div>
              </article>
            ))}
            {!loading && preview.length === 0 && <p className="muted">No results with current filters.</p>}
          </div>
        </section>
      </div>
    </section>
  )
}
