import { useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react'
import VideoInfoModal from '../components/VideoInfoModal'
import RetroVerseRandomizer, { type RandomizerLabel, type RandomizerTier, type SpinResult } from '../components/RetroVerseRandomizer'
import { usePlaylistContext } from '../context/PlaylistContext'
import { formatDuration, formatYear, loadVideoIndex, rowSearchText, stableVideoHash, type VideoRecord } from '../lib/videoIndex'
import './VideoLibrary.css'

const SWIPE_ACTION_WIDTH = 132
const SWIPE_REVEAL_THRESHOLD = 40
const SWIPE_LOCK_THRESHOLD = 14
const SORT_CYCLE = ['plays', 'year', 'title', 'artist'] as const
const DECADE_PILLS = ['60s', '70s', '80s', '90s', '00s', '10s'] as const
const NEWNESS_FILTERS = ['all', '30d', '90d', '1y'] as const
const TIER_FILTERS = ['promo', 'light', 'medium', 'heavy', 'power'] as const
const RETENTION_FILTERS = ['all', 'S', 'A', 'B', 'C'] as const
const FILTER_STORAGE_KEY = 'retroverse.videoLibrary.filters.v1'

type SortMode = (typeof SORT_CYCLE)[number]
type DecadePill = (typeof DECADE_PILLS)[number]
type NewnessMode = (typeof NEWNESS_FILTERS)[number]
type TierFilter = (typeof TIER_FILTERS)[number]
type RetentionFilter = (typeof RETENTION_FILTERS)[number]
type YearDigit = number
type TouchState = {
  rowId: string | null
  startX: number
  startY: number
  baseOffset: number
  lock: 'undecided' | 'horizontal' | 'vertical'
  leftDistance: number
}

const TIER_TO_RANDOMIZER: Record<TierFilter, RandomizerTier> = {
  promo: 'Promo',
  light: 'Light',
  medium: 'Medium',
  heavy: 'Heavy',
  power: 'Power',
}
const RANDOMIZER_TO_TIER: Record<RandomizerTier, TierFilter> = {
  Promo: 'promo',
  Light: 'light',
  Medium: 'medium',
  Heavy: 'heavy',
  Power: 'power',
}
const SORT_LABELS: Record<SortMode, string> = {
  plays: 'Plays',
  year: 'Year',
  title: 'Title',
  artist: 'Artist',
}

const normalizeSearchText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const tokenize = (value: string) => {
  const normalized = normalizeSearchText(value)
  return normalized ? normalized.split(/\s+/) : []
}

const parseYearToken = (value: string): number | null => {
  if (!/^\d{2,4}$/.test(value)) return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  if (value.length === 2) return 1900 + num
  return num
}

const parseYearRangeToken = (value: string): { start: number; end: number } | null => {
  const match = value.match(/^(\d{2,4})-(\d{2,4})$/)
  if (!match) return null
  const left = parseYearToken(match[1])
  if (left === null) return null
  let right = parseYearToken(match[2])
  if (right === null) return null

  if (match[1].length === 4 && match[2].length === 2) {
    const century = Math.floor(left / 100) * 100
    right = century + Number(match[2])
  }

  return { start: Math.min(left, right), end: Math.max(left, right) }
}

const parseSearch = (query: string): { textTokens: string[]; yearValues: number[]; yearRanges: Array<{ start: number; end: number }> } => {
  const normalizedQuery = query.replace(/[–—]/g, '-')
  const rawTokens = normalizedQuery.toLowerCase().split(/\s+/).map((token) => token.trim()).filter(Boolean)
  const textParts: string[] = []
  const yearValues: number[] = []
  const yearRanges: Array<{ start: number; end: number }> = []

  for (const token of rawTokens) {
    const cleaned = token.replace(/[^0-9a-z-]/g, '')
    if (!cleaned) continue

    const yearRange = parseYearRangeToken(cleaned)
    if (yearRange) {
      yearRanges.push(yearRange)
      continue
    }

    const yearValue = parseYearToken(cleaned)
    if (yearValue !== null && cleaned.length === 4) {
      yearValues.push(yearValue)
      continue
    }

    textParts.push(cleaned)
  }

  return {
    textTokens: tokenize(textParts.join(' ')),
    yearValues,
    yearRanges,
  }
}

const matchesDecade = (year: number | null, pill: DecadePill) => {
  if (typeof year !== 'number') return false
  if (pill === '60s') return year >= 1960 && year <= 1969
  if (pill === '70s') return year >= 1970 && year <= 1979
  if (pill === '80s') return year >= 1980 && year <= 1989
  if (pill === '90s') return year >= 1990 && year <= 1999
  if (pill === '00s') return year >= 2000 && year <= 2009
  return year >= 2010
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const sampleRandom = <T,>(items: T[], count: number): T[] => {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, count)
}

const recencyMatch = (row: VideoRecord, mode: NewnessMode, nowMs: number) => {
  if (mode === 'all') return true
  const windowDays = mode === '30d' ? 30 : mode === '90d' ? 90 : 365
  const threshold = nowMs - windowDays * 24 * 60 * 60 * 1000
  if (row.firstSeenMs) return row.firstSeenMs >= threshold
  if (row.addedAt) {
    const asMs = new Date(row.addedAt).getTime()
    if (Number.isFinite(asMs)) return asMs >= threshold
  }
  return false
}

const normalizeTierFilter = (value: VideoRecord['tier']): TierFilter | null => {
  if (!value) return null
  const normalized = value.toLowerCase()
  return TIER_FILTERS.includes(normalized as TierFilter) ? (normalized as TierFilter) : null
}

export default function VideoLibrary() {
  const { addToQueue, openPlayer } = usePlaylistContext()

  const [rows, setRows] = useState<VideoRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('plays')
  const [newnessMode, setNewnessMode] = useState<NewnessMode>('all')
  const [activeDecades, setActiveDecades] = useState<DecadePill[]>([])
  const [activeTiers, setActiveTiers] = useState<TierFilter[]>([])
  const [activeYearDigits, setActiveYearDigits] = useState<YearDigit[]>([])
  const [activeSpinYear, setActiveSpinYear] = useState<number | null>(null)
  const [retentionFilter, setRetentionFilter] = useState<RetentionFilter>('all')
  const [sortButtonPrimed, setSortButtonPrimed] = useState(false)
  const [isConsoleOpen, setIsConsoleOpen] = useState(false)
  const [spinFallbackDecade, setSpinFallbackDecade] = useState<DecadePill | 'all' | null>(null)
  const [fallbackRows, setFallbackRows] = useState<VideoRecord[] | null>(null)
  const [openSwipe, setOpenSwipe] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<{ id: string; offset: number } | null>(null)
  const [infoVideo, setInfoVideo] = useState<VideoRecord | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const touchRef = useRef<TouchState>({
    rowId: null,
    startX: 0,
    startY: 0,
    baseOffset: 0,
    lock: 'undecided',
    leftDistance: 0,
  })

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const parsed = await loadVideoIndex()
        if (!cancelled) setRows(parsed)
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
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY)
      if (!raw) return
      const data = JSON.parse(raw) as {
        search?: string
        sortMode?: SortMode
        newnessMode?: NewnessMode
        activeDecades?: DecadePill[]
        activeTiers?: TierFilter[]
        activeYearDigits?: YearDigit[]
        activeSpinYear?: number | null
        retentionFilter?: RetentionFilter
      }
      if (typeof data.search === 'string') setSearch(data.search)
      if (data.sortMode && SORT_CYCLE.includes(data.sortMode)) setSortMode(data.sortMode)
      if (data.newnessMode && NEWNESS_FILTERS.includes(data.newnessMode)) setNewnessMode(data.newnessMode)
      if (Array.isArray(data.activeDecades)) {
        const filtered = data.activeDecades.filter((pill): pill is DecadePill => DECADE_PILLS.includes(pill))
        setActiveDecades(filtered)
      }
      if (Array.isArray(data.activeTiers)) {
        const filtered = data.activeTiers.filter((tier): tier is TierFilter => TIER_FILTERS.includes(tier))
        setActiveTiers(filtered)
      }
      if (Array.isArray(data.activeYearDigits)) {
        const filtered = data.activeYearDigits.filter((digit): digit is YearDigit => Number.isInteger(digit) && digit >= 0 && digit <= 9)
        setActiveYearDigits(filtered)
      }
      if (typeof data.activeSpinYear === 'number' && Number.isInteger(data.activeSpinYear)) {
        setActiveSpinYear(data.activeSpinYear)
      }
      if (data.retentionFilter && RETENTION_FILTERS.includes(data.retentionFilter)) {
        setRetentionFilter(data.retentionFilter)
      }
    } catch {
      // Ignore malformed persisted filter state.
    }
  }, [])

  useEffect(() => {
    const payload = {
      search,
      sortMode,
      newnessMode,
      activeDecades,
      activeTiers,
      activeYearDigits,
      activeSpinYear,
      retentionFilter,
    }
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(payload))
  }, [search, sortMode, newnessMode, activeDecades, activeTiers, activeYearDigits, activeSpinYear, retentionFilter])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 1500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const query = useMemo(() => parseSearch(search), [search])

  const filteredVideos = useMemo(() => {
    const nowMs = Date.now()

    return rows
      .filter((row) => {
        const rowText = rowSearchText(row)
        if (query.textTokens.length > 0) {
          const textTokens = tokenize(rowText)
          const isTextMatch = query.textTokens.every((token) => textTokens.some((word) => word.startsWith(token)))
          if (!isTextMatch) return false
        }

        if (query.yearValues.length > 0) {
          if (typeof row.year !== 'number') return false
          const isYearMatch = query.yearValues.every((year) => row.year === year)
          if (!isYearMatch) return false
        }

        if (query.yearRanges.length > 0) {
          if (typeof row.year !== 'number') return false
          const isRangeMatch = query.yearRanges.every((range) => row.year! >= range.start && row.year! <= range.end)
          if (!isRangeMatch) return false
        }

        return true
      })
      .filter((row) => {
        if (activeSpinYear === null) return true
        return row.year === activeSpinYear
      })
      .filter((row) => {
        if (activeDecades.length === 0) return true
        return activeDecades.some((pill) => matchesDecade(row.year, pill))
      })
      .filter((row) => {
        if (activeYearDigits.length === 0) return true
        if (typeof row.year !== 'number') return false
        const digit = Math.abs(row.year) % 10
        return activeYearDigits.includes(digit)
      })
      .filter((row) => {
        if (retentionFilter === 'all') return true
        return row.retentionGrade === retentionFilter
      })
      .filter((row) => {
        if (activeTiers.length === 0) return true
        const tier = normalizeTierFilter(row.tier)
        if (!tier) return false
        return activeTiers.includes(tier)
      })
      .filter((row) => recencyMatch(row, newnessMode, nowMs))
      .sort((a, b) => {
        if (sortMode === 'plays') {
          return b.playcount - a.playcount || a.title.localeCompare(b.title)
        }
        if (sortMode === 'year') {
          return (b.year ?? -1) - (a.year ?? -1) || a.title.localeCompare(b.title)
        }
        if (sortMode === 'artist') {
          return a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title)
        }
        return a.title.localeCompare(b.title)
      })
  }, [rows, query, activeSpinYear, activeDecades, activeYearDigits, activeTiers, retentionFilter, newnessMode, sortMode])
  const visibleRows = fallbackRows ?? filteredVideos

  useEffect(() => {
    if (!spinFallbackDecade) {
      setFallbackRows(null)
      return
    }
    if (filteredVideos.length > 0) {
      setFallbackRows(null)
      return
    }

    const candidates =
      typeof activeSpinYear === 'number'
        ? rows.filter((row) => row.year === activeSpinYear)
        : spinFallbackDecade === 'all'
          ? rows
          : rows.filter((row) => matchesDecade(row.year, spinFallbackDecade as DecadePill))
    setFallbackRows(sampleRandom(candidates, 5))
  }, [spinFallbackDecade, activeSpinYear, filteredVideos, rows])

  const onRowTouchStart = (event: ReactTouchEvent<HTMLElement>, row: VideoRecord) => {
    if (event.touches.length !== 1) return
    const touch = event.touches[0]

    touchRef.current = {
      rowId: row.id,
      startX: touch.clientX,
      startY: touch.clientY,
      baseOffset: openSwipe === row.id ? -SWIPE_ACTION_WIDTH : 0,
      lock: 'undecided',
      leftDistance: openSwipe === row.id ? SWIPE_ACTION_WIDTH : 0,
    }

    if (openSwipe && openSwipe !== row.id) {
      setOpenSwipe(null)
    }
  }

  const onRowTouchMove = (event: ReactTouchEvent<HTMLElement>) => {
    if (!touchRef.current.rowId || event.touches.length !== 1) return
    const touch = event.touches[0]

    const dx = touch.clientX - touchRef.current.startX
    const dy = touch.clientY - touchRef.current.startY
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    if (touchRef.current.lock === 'undecided' && (absDx > SWIPE_LOCK_THRESHOLD || absDy > SWIPE_LOCK_THRESHOLD)) {
      const horizontal = dx < 0 && absDx > absDy * 1.4
      touchRef.current.lock = horizontal ? 'horizontal' : 'vertical'
    }

    if (touchRef.current.lock !== 'horizontal') return

    const nextOffset = clamp(touchRef.current.baseOffset + dx, -SWIPE_ACTION_WIDTH, 0)
    touchRef.current.leftDistance = Math.max(0, -nextOffset)
    setDragOffset({ id: touchRef.current.rowId, offset: nextOffset })
    event.preventDefault()
  }

  const onRowTouchEnd = () => {
    if (!touchRef.current.rowId) return

    const id = touchRef.current.rowId
    if (touchRef.current.lock === 'horizontal' && touchRef.current.leftDistance >= SWIPE_REVEAL_THRESHOLD) {
      setOpenSwipe(id)
    } else {
      setOpenSwipe(null)
    }

    setDragOffset(null)
    touchRef.current = {
      rowId: null,
      startX: 0,
      startY: 0,
      baseOffset: 0,
      lock: 'undecided',
      leftDistance: 0,
    }
  }

  const onAddToQueue = (row: VideoRecord) => {
    addToQueue(row)
    setToast(`${row.title} added to playlist`)
    setOpenSwipe(null)
  }

  const openInfoModal = (entry: VideoRecord) => {
    setInfoVideo(entry)
  }

  const statusLabel = loading || error ? (loading ? 'Loading…' : 'Load failed') : `${filteredVideos.length}/${rows.length}`
  const openFilterConsole = () => {
    setIsConsoleOpen(true)
  }
  const closeFilterConsole = () => {
    setIsConsoleOpen(false)
  }
  const clearAllFilters = () => {
    setSpinFallbackDecade(null)
    setFallbackRows(null)
    setSearch('')
    setSortMode('plays')
    setSortButtonPrimed(false)
    setActiveDecades([])
    setActiveTiers([])
    setActiveYearDigits([])
    setActiveSpinYear(null)
    setRetentionFilter('all')
    setNewnessMode('all')
    localStorage.removeItem(FILTER_STORAGE_KEY)
  }
  const cycleSortMode = () => {
    setSortButtonPrimed(true)
    setSortMode((current) => {
      const currentIndex = SORT_CYCLE.indexOf(current)
      const nextIndex = (currentIndex + 1) % SORT_CYCLE.length
      return SORT_CYCLE[nextIndex]
    })
  }
  const onRandomizerSpinComplete = (result: SpinResult) => {
    const decade = result.decade as DecadePill
    setFallbackRows(null)
    setSpinFallbackDecade(decade)
    setActiveDecades([decade])
    setActiveSpinYear(result.year)
    setActiveYearDigits([])
    setActiveTiers([result.tier.toLowerCase() as TierFilter])
  }
  const onRandomizerToggleDecade = (decade: RandomizerLabel) => {
    setSpinFallbackDecade(null)
    setFallbackRows(null)
    setActiveSpinYear(null)
    setActiveDecades((prev) => {
      const pill = decade as DecadePill
      return prev.includes(pill) ? prev.filter((value) => value !== pill) : [...prev, pill]
    })
  }
  const onRandomizerToggleDigit = (digit: number) => {
    setSpinFallbackDecade(null)
    setFallbackRows(null)
    setActiveSpinYear(null)
    setActiveYearDigits((prev) => (prev.includes(digit) ? prev.filter((value) => value !== digit) : [...prev, digit]))
  }
  const onRandomizerToggleTier = (tier: RandomizerTier) => {
    setSpinFallbackDecade(null)
    setFallbackRows(null)
    setActiveSpinYear(null)
    const filterTier = RANDOMIZER_TO_TIER[tier]
    setActiveTiers((prev) => (prev.includes(filterTier) ? prev.filter((value) => value !== filterTier) : [...prev, filterTier]))
  }

  return (
    <section className="vl-page">
      <div className="vl-frame">
        <div className="frame-top">
          <div className="header-bar">
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSpinFallbackDecade(null)
                setFallbackRows(null)
                setSearch(event.target.value)
              }}
              placeholder="Search . ."
              className="search-field search-input"
              aria-label="Search RetroVerse library"
            />
            <div className="video-count">{statusLabel}</div>
          </div>

          <div className="filter-strip">
            <div className="filter-strip-row">
              <button type="button" className="clear-btn filter-row-btn" onClick={clearAllFilters}>
                Clear
              </button>
                <button type="button" className="clear-btn filter-row-btn" onClick={cycleSortMode}>
                {sortButtonPrimed ? SORT_LABELS[sortMode] : 'Sort'}
                </button>
              <button
                type="button"
                className={`filter-trigger filter-row-btn ${isConsoleOpen ? 'is-active' : ''}`}
                onClick={() => (isConsoleOpen ? closeFilterConsole() : openFilterConsole())}
                aria-expanded={isConsoleOpen}
              >
                Filters
              </button>
            </div>
          </div>
        </div>

        <div ref={listRef} className="scrollable-list">
          {error && <div className="placeholder-box">Failed to load: {error}</div>}

          {!error && (
            <div className="vl-list">
              {visibleRows.map((video) => {
                const key = stableVideoHash(video)
                const currentOffset = dragOffset?.id === video.id ? dragOffset.offset : openSwipe === video.id ? -SWIPE_ACTION_WIDTH : 0
                const tierClass = normalizeTierFilter(video.tier)

                return (
                  <article
                    key={key}
                    className={`vl-row-shell card ${tierClass ?? ''}`}
                    onTouchStart={(event) => onRowTouchStart(event, video)}
                    onTouchMove={onRowTouchMove}
                    onTouchEnd={onRowTouchEnd}
                    onTouchCancel={onRowTouchEnd}
                  >
                    <button
                      type="button"
                      className="vl-row-action"
                      onClick={() => onAddToQueue(video)}
                      aria-label={`Add ${video.title} to playlist`}
                    >
                      Add to Playlist
                    </button>

                    <div className="vl-row-surface" style={{ transform: `translateX(${currentOffset}px)` }}>
                      <button
                        type="button"
                        className="vl-row-play"
                        onClick={() => video.videoUrl && openPlayer(video, { preferQueue: true })}
                        disabled={!video.videoUrl}
                        aria-label={video.videoUrl ? `Play ${video.title}` : `${video.title} unavailable`}
                      >
                        <div className="vl-thumb" aria-hidden>
                          {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" loading="lazy" /> : <div className="thumb-placeholder" />}
                        </div>

                        <div className="vl-text">
                          <div className="vl-title">{video.title}</div>
                          <div className="vl-artist">{video.artist}</div>
                          <div className="meta-line">
                            <div className="meta-left">
                              {formatYear(video.year)} • {formatDuration(video.durationSec)} ▶ {video.playcount}
                            </div>
                            <div className="meta-right">
                              <button
                                type="button"
                                className="vl-info-btn"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  openInfoModal(video)
                                }}
                                aria-label="Open video info"
                              >
                                i
                              </button>
                            </div>
                          </div>
                        </div>
                      </button>
                    </div>
                  </article>
                )
              })}

              {!loading && visibleRows.length === 0 && <div className="placeholder-box">No videos match this search.</div>}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="vl-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      <VideoInfoModal
        video={infoVideo}
        onClose={() => setInfoVideo(null)}
        onAddToQueue={(video) => {
          onAddToQueue(video)
        }}
      />

      <RetroVerseRandomizer
        open={isConsoleOpen}
        size={560}
        matchCount={filteredVideos.length}
        matchCountReady={!loading}
        onClearAll={clearAllFilters}
        onClose={closeFilterConsole}
        onSpinComplete={onRandomizerSpinComplete}
        selectedDecades={activeDecades as RandomizerLabel[]}
        selectedDigits={activeYearDigits}
        selectedTiers={activeTiers.map((tier) => TIER_TO_RANDOMIZER[tier])}
        onToggleDecade={onRandomizerToggleDecade}
        onToggleDigit={onRandomizerToggleDigit}
        onToggleTier={onRandomizerToggleTier}
        onSpinStart={() => {
          setSpinFallbackDecade(null)
          setFallbackRows(null)
        }}
      />
    </section>
  )
}
