import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlaylistContext } from '../context/PlaylistContext'
import { loadVideoIndex, type VideoRecord } from '../lib/videoIndex'
import SlotCounter from './SlotCounter'
import {
  COLOR_BASE_CREAM,
  COLOR_INK_PRIMARY,
  COLOR_INK_SECONDARY,
  COLOR_INNER_PANEL,
  COLOR_PANEL_CREAM,
  getRingPalette,
  type RingType,
  shiftHexLightness,
  YEAR_DIGIT_SELECTED_LIGHTNESS_SHIFT,
} from '../design/ringColors'
import './SetBuilderRingsV2.css'

type RotationTier = 'Promo' | 'Light' | 'Medium' | 'Heavy' | 'Power'
type SetBuilderMode = 'All' | 'New'

interface SetBuilderState {
  decade: number
  yearDigit: number
  span: number
  tier: RotationTier
  count: number
  mode: SetBuilderMode
}

interface RingSelectorProps<T extends string | number> {
  values: readonly T[]
  selected: T
  onSelect: (value: T) => void
  radius: number
  thickness: number
  fontScale: number
  strokeWidth: number
  ringType: Exclude<RingType, 'center'>
  selectedLightnessShift?: number
  overridePalette?: boolean
  colors?: Record<string | number, string>
  centerX: number
  centerY: number
  ringKey: string
  labelFormatter?: (value: T) => string
  startAngle?: number
  rotationOffset?: number
}

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

function describeDonutSlice(cx: number, cy: number, innerR: number, outerR: number, start: number, end: number) {
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

function RingSelector<T extends string | number>({
  values,
  selected,
  onSelect,
  radius,
  thickness,
  fontScale,
  strokeWidth,
  ringType,
  selectedLightnessShift,
  overridePalette,
  colors,
  centerX,
  centerY,
  ringKey,
  labelFormatter,
  startAngle = -90,
  rotationOffset = 0,
}: RingSelectorProps<T>) {
  const total = values.length
  const sliceAngle = 360 / total
  const innerRadius = radius - thickness / 2
  const outerRadius = radius + thickness / 2
  const textRadius = radius
  const hitStroke = Math.max(48, thickness + 18)
  const labelSize = Math.max(12, thickness * 0.42 * fontScale)
  const yearDigitPalette = getRingPalette('yearDigit') as Record<number, string>

  return (
    <g className={`sbr2-ring-layer sbr2-ring-${ringKey}`} transform={`rotate(${rotationOffset} ${centerX} ${centerY})`}>
      {values.map((value, index) => {
        const start = startAngle + index * sliceAngle
        const end = startAngle + (index + 1) * sliceAngle
        const path = describeDonutSlice(centerX, centerY, innerRadius, outerRadius, start, end)
        const hitArc = describeArc(centerX, centerY, textRadius, start, end)
        const isSelected = selected === value
        const palette = (overridePalette && colors ? colors : getRingPalette(ringType)) as Record<string | number, string>
        const valueKey = typeof value === 'number' ? value : String(value)
        const baseFill =
          ringType === 'yearDigit'
            ? yearDigitPalette[Number(value)]!
            : palette[valueKey] ?? palette[String(value)] ?? COLOR_PANEL_CREAM
        const shift = selectedLightnessShift ?? 0.07
        const fill = isSelected ? shiftHexLightness(baseFill, shift) : baseFill
        const textValue = labelFormatter ? labelFormatter(value) : String(value)
        const midAngle = (start + end) / 2
        const effectiveMidAngle = midAngle + rotationOffset
        const normalizedMid = ((effectiveMidAngle % 360) + 360) % 360
        const flipText = normalizedMid > 90 && normalizedMid < 270

        return (
          <g
            key={`${ringKey}-${String(value)}`}
            className={isSelected ? 'ring-segment sbr2-slice is-active' : 'ring-segment sbr2-slice'}
            onClick={() => onSelect(value)}
            role="button"
            tabIndex={0}
            aria-label={`${ringKey} ${textValue}`}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(value)
              }
            }}
          >
            <path className="sbr2-hit-area" d={hitArc} strokeWidth={hitStroke} />
            <path className="sbr2-slice-shape" d={path} style={{ fill, strokeWidth }} />
            <g transform={`translate(${centerX} ${centerY}) rotate(${midAngle})`}>
              <g transform={`translate(0 ${-textRadius})`}>
                <text
                  className="sbr2-slice-label"
                  style={{ fill: COLOR_INK_PRIMARY, fontSize: labelSize }}
                  transform={flipText ? 'rotate(180)' : undefined}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {textValue}
                </text>
              </g>
            </g>
          </g>
        )
      })}
    </g>
  )
}

const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020] as const
const YEAR_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const
const SPANS = [1, 3, 5, 7, 10, 15] as const
const TIERS: readonly RotationTier[] = ['Promo', 'Light', 'Medium', 'Heavy', 'Power'] as const
const COUNTS = [5, 10, 15, 20] as const
const NEW_WINDOW_DAYS = 90

const isWithinRecentWindow = (video: VideoRecord, nowMs: number) => {
  const thresholdMs = nowMs - NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000
  if (video.firstSeenMs) return video.firstSeenMs >= thresholdMs
  if (video.addedAt) {
    const asMs = new Date(video.addedAt).getTime()
    if (Number.isFinite(asMs)) return asMs >= thresholdMs
  }
  return false
}

const INITIAL_STATE: SetBuilderState = {
  decade: 1980,
  yearDigit: 0,
  span: 5,
  tier: 'Medium',
  count: 10,
  mode: 'All',
}

const filterSetBuilderVideos = (
  videos: VideoRecord[],
  spanStart: number,
  spanEnd: number,
  selectedTier: RotationTier,
  mode: SetBuilderMode,
  nowMs: number,
) =>
  videos.filter((video) => {
    const year = video.year
    if (typeof year !== 'number' || year < spanStart || year > spanEnd) return false

    if (mode === 'New') return isWithinRecentWindow(video, nowMs)

    return video.tier === selectedTier
  })

export default function SetBuilderRingsV2() {
  const navigate = useNavigate()
  const { addManyToQueue, clearQueue, queue } = usePlaylistContext()
  const [state, setState] = useState<SetBuilderState>(INITIAL_STATE)
  const [videos, setVideos] = useState<VideoRecord[]>([])
  const [hasLoadedVideos, setHasLoadedVideos] = useState(false)
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 400

  const startYear = state.decade + state.yearDigit
  const endYear = startYear + state.span
  const mode: SetBuilderMode = state.mode

  const baseRingThickness = 1
  const baseCenterRadius = 39.5
  const baseFontSize = 1
  const baseStrokeWidth = 2
  const geometry = {
    ringThickness: isMobile ? baseRingThickness * 1.12 : baseRingThickness,
    centerRadius: isMobile ? baseCenterRadius * 1.08 : baseCenterRadius,
    fontSize: isMobile ? baseFontSize * 1.15 : baseFontSize,
    strokeWidth: isMobile ? baseStrokeWidth * 0.9 : baseStrokeWidth,
  }

  const ringLayout = useMemo(() => {
    const outermostRadius = 285
    const baseThicknesses = [50, 48, 44, 40, 38] as const
    const interRingGaps = [1, 1, 0, 0] as const

    let currentOuter = outermostRadius
    return baseThicknesses.map((base, index) => {
      const thickness = base * geometry.ringThickness
      const radius = currentOuter - thickness / 2
      const inner = currentOuter - thickness
      currentOuter = inner - (interRingGaps[index] ?? 0)
      return { radius, thickness }
    })
  }, [geometry.ringThickness])

  const [decadeRing, yearDigitRing, spanRing, tierRing, countRing] = ringLayout

  useEffect(() => {
    let cancelled = false

    loadVideoIndex()
      .then((rows) => {
        if (!cancelled) {
          setVideos(rows)
          setHasLoadedVideos(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVideos([])
          setHasLoadedVideos(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const filteredVideos = useMemo(() => {
    const nowMs = Date.now()
    return filterSetBuilderVideos(videos, startYear, endYear, state.tier, mode, nowMs)
  }, [videos, startYear, endYear, state.tier, mode])
  const matchCount = filteredVideos.length
  const addCandidates = useMemo(() => filteredVideos.slice(0, state.count), [filteredVideos, state.count])

  const centerX = 320
  const centerY = 320
  const DIAL_VIEWBOX_SIZE = 640
  const centerScale = 0.62
  const centerLabelScale = 0.95
  const tierInnerRadius = tierRing.radius - tierRing.thickness / 2
  const centerRadius = tierInnerRadius * centerScale
  const centerDiameterPercent = (centerRadius * 2 * 100) / DIAL_VIEWBOX_SIZE
  const centerPalette = getRingPalette('center')
  const shellStyle = useMemo(
    () =>
      ({
        '--sbr2-base-cream': COLOR_BASE_CREAM,
        '--sbr2-panel-cream': COLOR_PANEL_CREAM,
        '--sbr2-inner-panel': COLOR_INNER_PANEL,
        '--sbr2-ink': COLOR_INK_PRIMARY,
        '--sbr2-ink-secondary': COLOR_INK_SECONDARY,
      }) as CSSProperties,
    [],
  )

  const centerDiscStyle = useMemo(
    () => ({
      transform: 'translate(-50%, -50%)',
      backgroundColor: state.mode === 'All' ? centerPalette.All : centerPalette.New,
      width: `${centerDiameterPercent}%`,
      height: `${centerDiameterPercent}%`,
      fontSize: `${centerLabelScale * 100}%`,
      fontWeight: 800,
      color: COLOR_INK_PRIMARY,
    }),
    [state.mode, centerDiameterPercent, centerPalette.All, centerPalette.New],
  )

  return (
    <section className="sbr2-shell" style={shellStyle}>
      <header className="sbr2-header">
        <h1>
          RetroVerse SetBuilder
          <span className="sbr2-trademark" aria-label="trademark">
            ™
          </span>
        </h1>
        <SlotCounter value={matchCount} minSlots={4} ready={hasLoadedVideos} />
        <div className="sbr2-actions">
          <button
            type="button"
            className="sbr2-action-btn sbr2-action-btn--primary"
            onClick={() => addManyToQueue(addCandidates)}
            disabled={addCandidates.length === 0}
          >
            Add {addCandidates.length} to Playlist
          </button>
          <button type="button" className="sbr2-action-btn" onClick={clearQueue} disabled={queue.length === 0}>
            Clear Playlist
          </button>
          <button type="button" className="sbr2-action-btn" onClick={() => navigate('/playlists')}>
            Playlist ({queue.length})
          </button>
        </div>
        <p>
          {startYear} → {endYear}
        </p>
      </header>

      <div className="sbr2-panel">
        <div className="sbr2-wheel-wrap">
          <div className="ring-container decade">
            <svg viewBox="0 0 640 640" className="sbr2-svg ring-svg" role="img" aria-label="Set Builder concentric rings">
              <RingSelector
                ringKey="decade"
                ringType="decade"
                values={DECADES}
                selected={state.decade}
                onSelect={(value) => setState((prev) => ({ ...prev, decade: value }))}
                radius={decadeRing.radius}
                thickness={decadeRing.thickness}
                fontScale={geometry.fontSize}
                strokeWidth={geometry.strokeWidth}
                centerX={centerX}
                centerY={centerY}
              />

              <RingSelector
                ringKey="year-digit"
                ringType="yearDigit"
                values={YEAR_DIGITS}
                selected={state.yearDigit}
                onSelect={(value) => setState((prev) => ({ ...prev, yearDigit: value }))}
                radius={yearDigitRing.radius}
                thickness={yearDigitRing.thickness}
                fontScale={geometry.fontSize}
                strokeWidth={geometry.strokeWidth}
                centerX={centerX}
                centerY={centerY}
                selectedLightnessShift={YEAR_DIGIT_SELECTED_LIGHTNESS_SHIFT}
              />

              <RingSelector
                ringKey="span"
                ringType="span"
                values={SPANS}
                selected={state.span}
                onSelect={(value) => setState((prev) => ({ ...prev, span: value }))}
                radius={spanRing.radius}
                thickness={spanRing.thickness}
                fontScale={geometry.fontSize}
                strokeWidth={geometry.strokeWidth}
                centerX={centerX}
                centerY={centerY}
                labelFormatter={(value) => `${value}y`}
                selectedLightnessShift={0.06}
                rotationOffset={15}
              />

              <RingSelector
                ringKey="tier"
                ringType="tier"
                values={TIERS}
                selected={state.tier}
                onSelect={(value) => setState((prev) => ({ ...prev, tier: value }))}
                radius={tierRing.radius}
                thickness={tierRing.thickness}
                fontScale={geometry.fontSize}
                strokeWidth={geometry.strokeWidth}
                centerX={centerX}
                centerY={centerY}
                selectedLightnessShift={0.06}
                rotationOffset={18}
              />

              <RingSelector
                ringKey="count"
                ringType="count"
                values={COUNTS}
                selected={state.count}
                onSelect={(value) => setState((prev) => ({ ...prev, count: value }))}
                radius={countRing.radius}
                thickness={countRing.thickness}
                fontScale={geometry.fontSize}
                strokeWidth={geometry.strokeWidth}
                centerX={centerX}
                centerY={centerY}
                selectedLightnessShift={0.06}
                rotationOffset={45}
              />
            </svg>
          </div>

          <button
            type="button"
            className={`sbr2-center-toggle ${state.mode === 'New' ? 'is-new' : 'is-all'}`}
            style={centerDiscStyle}
            onClick={() =>
              setState((prev) => ({
                ...prev,
                mode: prev.mode === 'All' ? 'New' : 'All',
              }))
            }
            aria-label={`Toggle mode from ${mode}`}
          >
            <span>{mode}</span>
          </button>
        </div>
      </div>
    </section>
  )
}
