import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react'
import { loadVideoIndex, type VideoRecord } from '../lib/videoIndex'
import { YEAR_DOMAIN_MAX, YEAR_DOMAIN_MIN, recencyLabel, type RecencyValue } from '../pages/setBuilderUtils'
import {
  COLOR_BASE_CREAM,
  COLOR_INK_PRIMARY,
  COLOR_INNER_PANEL,
  COLOR_PANEL_CREAM,
  getRingPalette,
  type RingType,
  shiftHexLightness,
} from '../design/ringColors'
import './SetBuilderWheel.css'

const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020] as const
const SPANS = [1, 3, 5, 7, 10, 15, 'FULL'] as const
const TIERS = ['Promo', 'Light', 'Medium', 'Heavy', 'Power'] as const
const COUNTS = [5, 10, 15, 20, 25] as const
const RECENCY_OPTIONS: RecencyValue[] = ['all', '7d', '30d', '90d']

// Utility to describe arcs
function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const rad = (angle - 90) * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polarToCartesian(cx, cy, r, end)
  const e = polarToCartesian(cx, cy, r, start)
  const largeArc = end - start <= 180 ? 0 : 1
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 0 ${e.x} ${e.y}`
}

function describeRingSlice(cx: number, cy: number, innerR: number, outerR: number, start: number, end: number) {
  const outerStart = polarToCartesian(cx, cy, outerR, start)
  const outerEnd = polarToCartesian(cx, cy, outerR, end)
  const innerEnd = polarToCartesian(cx, cy, innerR, end)
  const innerStart = polarToCartesian(cx, cy, innerR, start)
  const largeArc = end - start <= 180 ? 0 : 1

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

const parseAddedAt = (row: VideoRecord): number | null => {
  if (row.firstSeenMs) return row.firstSeenMs
  if (row.addedAt) {
    const ms = new Date(row.addedAt).getTime()
    if (Number.isFinite(ms)) return ms
  }
  return null
}

export default function SetBuilderWheel() {
  const [rows, setRows] = useState<VideoRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [decadeIndex, setDecadeIndex] = useState(3)
  const [exactYear, setExactYear] = useState<number>(DECADES[3])
  const [spanIndex, setSpanIndex] = useState(2)
  const [tierIndex, setTierIndex] = useState(3)
  const [countIndex, setCountIndex] = useState(1)
  const [recencyFilter, setRecencyFilter] = useState<RecencyValue>('all')

  const idPrefix = useId().replace(/:/g, '')

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const data = await loadVideoIndex()
        if (!cancelled) setRows(data)
      } catch (error) {
        if (!cancelled) setLoadError((error as Error).message || 'Load error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedDecade = DECADES[decadeIndex]
  const selectedSpan = SPANS[spanIndex]
  const selectedTier = TIERS[tierIndex]
  const selectedCount = COUNTS[countIndex]
  const yearMin = selectedDecade - 5
  const yearMax = selectedDecade + 4

  const timeRange = useMemo(() => {
    if (selectedSpan === 'FULL') return { start: YEAR_DOMAIN_MIN, end: YEAR_DOMAIN_MAX }
    return { start: exactYear - selectedSpan, end: exactYear + selectedSpan }
  }, [exactYear, selectedSpan])

  const matchCount = useMemo(() => {
    const nowMs = Date.now()
    const tierId = selectedTier.toLowerCase()

    return rows.filter((row) => {
      const rowTier = row.tier ? row.tier.toLowerCase() : ''
      if (rowTier !== tierId) return false

      if (typeof row.year !== 'number') return false
      if (row.year < timeRange.start || row.year > timeRange.end) return false

      if (recencyFilter !== 'all') {
        const days = recencyFilter === '7d' ? 7 : recencyFilter === '30d' ? 30 : 90
        const timestamp = parseAddedAt(row)
        if (!timestamp) return false
        if (timestamp < nowMs - days * 24 * 60 * 60 * 1000) return false
      }

      return true
    }).length
  }, [recencyFilter, rows, selectedTier, timeRange.end, timeRange.start])

  const handleDecadeSelect = (index: number) => {
    setDecadeIndex(index)
    setExactYear(DECADES[index])
  }

  const adjustYear = (delta: number) => {
    setExactYear((year) => Math.max(yearMin, Math.min(yearMax, year + delta)))
  }

  const matchesLabel = loading ? '...' : String(matchCount)

  const centerX = 230
  const centerY = 230
  const shellStyle = useMemo(
    () =>
      ({
        '--sbw-base-cream': COLOR_BASE_CREAM,
        '--sbw-panel-cream': COLOR_PANEL_CREAM,
        '--sbw-inner-panel': COLOR_INNER_PANEL,
        '--sbw-ink': COLOR_INK_PRIMARY,
      }) as CSSProperties,
    [],
  )

  const ringDefs = [
    {
      key: 'decade',
      ringType: 'decade' as const,
      title: 'Decade',
      labels: DECADES.map((year) => String(year)),
      activeIndex: decadeIndex,
      onSelect: handleDecadeSelect,
      innerR: 158,
      outerR: 198,
      textClass: 'sbw-text-decade',
    },
    {
      key: 'span',
      ringType: 'span' as const,
      title: 'Span',
      labels: SPANS.map((value) => (value === 'FULL' ? value : `${value}y`)),
      activeIndex: spanIndex,
      onSelect: (index: number) => setSpanIndex(index),
      innerR: 114,
      outerR: 150,
      textClass: 'sbw-text-span',
    },
    {
      key: 'tier',
      ringType: 'tier' as const,
      title: 'Tier',
      labels: TIERS,
      activeIndex: tierIndex,
      onSelect: (index: number) => setTierIndex(index),
      innerR: 72,
      outerR: 106,
      textClass: 'sbw-text-tier',
    },
  ] as const

  const resolveRingColor = (
    ringType: Exclude<RingType, 'center'>,
    paletteKey: string | number,
    isSelected: boolean,
    selectedShift = 0.06,
    fallback = COLOR_PANEL_CREAM,
  ) => {
    const palette = getRingPalette(ringType) as Record<string | number, string>
    const baseColor = palette[paletteKey] ?? palette[String(paletteKey)] ?? fallback
    return isSelected ? shiftHexLightness(baseColor, selectedShift) : baseColor
  }

  const ringSliceColor = (ringType: (typeof ringDefs)[number]['ringType'], label: string, isActive: boolean) => {
    if (ringType === 'decade') {
      return resolveRingColor('decade', Number(label), isActive, 0.07, COLOR_PANEL_CREAM)
    }

    if (ringType === 'span') {
      if (label === 'FULL') return isActive ? shiftHexLightness(COLOR_INNER_PANEL, 0.06) : COLOR_INNER_PANEL
      const numericValue = Number(label.replace('y', ''))
      return resolveRingColor('span', numericValue, isActive, 0.06, COLOR_PANEL_CREAM)
    }

    return resolveRingColor('tier', label, isActive, 0.06, COLOR_PANEL_CREAM)
  }

  return (
    <section className="sbw-shell" style={shellStyle}>
      <div className="sbw-summary">
        <h2>SET BUILDER</h2>
        <p>
          TIME RANGE: {timeRange.start} → {timeRange.end}
        </p>
        <p>
          TIER: {selectedTier} • RECENCY: {recencyLabel(recencyFilter)} • MATCHES: {matchesLabel}
        </p>
        {loadError && <p className="sbw-error">DATA ERROR: {loadError}</p>}
        <div className="sbw-recency-row" role="group" aria-label="Recency filter">
          {RECENCY_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              className={recencyFilter === value ? 'sbw-recency-btn is-active' : 'sbw-recency-btn'}
              onClick={() => setRecencyFilter(value)}
            >
              {recencyLabel(value)}
            </button>
          ))}
        </div>
      </div>

      <div className="sbw-wheel-wrap">
        <svg viewBox="0 0 460 460" className="sbw-svg" aria-label="RetroVerse set builder wheel">
          <defs>
            <filter id={`${idPrefix}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor={COLOR_INK_PRIMARY} floodOpacity="0.18" />
            </filter>
          </defs>

          {ringDefs.map((ring, ringIndex) => {
            const sliceAngle = 360 / ring.labels.length

            return (
              <g key={ring.key} className={`sbw-ring sbw-ring-${ring.key}`}>
                <text x={centerX} y={centerY - ring.outerR + 18} className="sbw-ring-title">
                  {ring.title.toUpperCase()}
                </text>

                {ring.labels.map((label, index) => {
                  const gap = Math.min(1.5, sliceAngle * 0.18)
                  const start = index * sliceAngle + gap / 2
                  const end = (index + 1) * sliceAngle - gap / 2
                  const path = describeRingSlice(centerX, centerY, ring.innerR, ring.outerR, start, end)
                  const textPath = describeArc(centerX, centerY, (ring.innerR + ring.outerR) / 2, start, end)
                  const textPathId = `${idPrefix}-${ring.key}-${index}`
                  const isActive = ring.activeIndex === index

                  return (
                    <g
                      key={`${ring.key}-${label}`}
                      className={isActive ? 'sbw-slice is-active' : 'sbw-slice'}
                      onClick={() => ring.onSelect(index)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          ring.onSelect(index)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`${ring.title} ${label}`}
                    >
                        <path
                          d={path}
                          className="sbw-slice-shape"
                          style={{ fill: ringSliceColor(ring.ringType, label, isActive), stroke: COLOR_INK_PRIMARY }}
                          filter={`url(#${idPrefix}-shadow)`}
                        />
                      <path id={textPathId} d={textPath} className="sbw-hidden-arc" />
                      <text className={`sbw-slice-text ${ring.textClass}`}>
                        <textPath href={`#${textPathId}`} startOffset="50%">
                          {label}
                        </textPath>
                      </text>
                    </g>
                  )
                })}

                {ringIndex < ringDefs.length - 1 && <circle cx={centerX} cy={centerY} r={ring.innerR - 6} className="sbw-separator" />}
              </g>
            )
          })}

          <g className="sbw-center-disc">
            <circle
              cx={centerX}
              cy={centerY}
              r={50}
              className="sbw-center-shape"
              style={{ fill: COLOR_BASE_CREAM, stroke: COLOR_INK_PRIMARY }}
            />
            <text x={centerX} y={centerY - 4} className="sbw-center-value">
              {selectedCount}
            </text>
            <text x={centerX} y={centerY + 16} className="sbw-center-caption">
              COUNT
            </text>

            {COUNTS.map((value, index) => {
              const angle = index * (360 / COUNTS.length)
              const { x, y } = polarToCartesian(centerX, centerY, 33, angle)
              const isActive = index === countIndex
              const countFill = resolveRingColor('count', value, isActive, 0.06, COLOR_INNER_PANEL)

              return (
                <g
                  key={value}
                  className={isActive ? 'sbw-count-chip is-active' : 'sbw-count-chip'}
                  onClick={() => setCountIndex(index)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setCountIndex(index)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Count ${value}`}
                >
                  <circle cx={x} cy={y} r={10.6} style={{ fill: countFill, stroke: COLOR_INK_PRIMARY }} />
                  <text x={x} y={y + 0.5}>
                    {value}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>

        <div className="sbw-year-controls" role="group" aria-label="Exact year controls">
          <button type="button" className="sbw-year-btn" onClick={() => adjustYear(-1)} disabled={exactYear <= yearMin}>
            &lt;
          </button>
          <div className="sbw-year-readout">{exactYear}</div>
          <button type="button" className="sbw-year-btn" onClick={() => adjustYear(1)} disabled={exactYear >= yearMax}>
            &gt;
          </button>
        </div>
      </div>
    </section>
  )
}
