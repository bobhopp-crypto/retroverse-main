import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import './RetroVerseRandomizer.css'
import roundLogo from '../assets/round-logo.png'
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

export type RandomizerLabel = '60s' | '70s' | '80s' | '90s' | '00s' | '10s'
export type RandomizerTier = 'Promo' | 'Light' | 'Medium' | 'Heavy' | 'Power'

export type SpinResult = {
  decade: RandomizerLabel
  year: number | null
  years: number[]
  tier: RandomizerTier
}

export type RetroVerseRandomizerProps = {
  open: boolean
  onClose: () => void
  matchCount?: number
  matchCountReady?: boolean
  onClearAll?: () => void
  onFinalSelection?: (result: { decade: RandomizerLabel; yearDigit: number; tier: RandomizerTier }) => void
  selectedDecades?: RandomizerLabel[]
  selectedDigits?: number[]
  selectedTiers?: RandomizerTier[]
  onToggleDecade?: (decade: RandomizerLabel) => void
  onToggleDigit?: (digit: number) => void
  onToggleTier?: (tier: RandomizerTier) => void
  size?: number
  onSpinComplete?: (result: SpinResult) => void
  onSpinStart?: () => void
  onSpinStop?: (result: SpinResult) => void
}

type RunnerState = {
  active: number | null
  previous: number | null
}

type SpinStage = 'idle' | 'outer' | 'middle' | 'inner' | 'done'
type SpinMode = 'light' | 'normal' | 'chaotic'
type RevealPhase = 'idle' | 'dim' | 'up' | 'back' | 'restore'

const DECADE_PATTERN: RandomizerLabel[] = ['60s', '70s', '80s', '90s', '00s', '10s']
const DECADE_SLICES: RandomizerLabel[] = [...DECADE_PATTERN]
const DECADE_DISPLAY: Record<RandomizerLabel, string> = {
  '60s': '1960',
  '70s': '1970',
  '80s': '1980',
  '90s': '1990',
  '00s': '2000',
  '10s': '2010',
}
const DIGIT_SLICES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const
const TIER_SLICES: RandomizerTier[] = ['Promo', 'Light', 'Medium', 'Heavy', 'Power']
const DECADE_TO_YEAR: Record<RandomizerLabel, number> = {
  '60s': 1960,
  '70s': 1970,
  '80s': 1980,
  '90s': 1990,
  '00s': 2000,
  '10s': 2010,
}

const VIEWBOX = 500
const CENTER = VIEWBOX / 2
// MASTER GEOMETRY (all rings derive from these values)
const BASE_RADIUS = 225
const RING_THICKNESS = 38
const RING_GAP = 4

// Derived radii
const OUTER_RING_OUTER = BASE_RADIUS
const OUTER_RING_INNER = BASE_RADIUS - RING_THICKNESS

const DIGIT_RING_OUTER = OUTER_RING_INNER - RING_GAP
const DIGIT_RING_INNER = DIGIT_RING_OUTER - RING_THICKNESS

const TIER_RING_OUTER = DIGIT_RING_INNER - RING_GAP
const TIER_RING_INNER = TIER_RING_OUTER - RING_THICKNESS

const CENTER_RING_RADIUS = TIER_RING_INNER - RING_GAP
const DECADE_LABEL_RADIUS = (OUTER_RING_OUTER + OUTER_RING_INNER) / 2
const DIGIT_LABEL_RADIUS = (DIGIT_RING_OUTER + DIGIT_RING_INNER) / 2
const DECADE_TEXT_STEP = 360 / DECADE_SLICES.length
const DIGIT_TEXT_STEP = 360 / DIGIT_SLICES.length

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

const polar = (cx: number, cy: number, radius: number, angleDeg: number) => {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  }
}

const ringPath = (outerRadius: number, innerRadius: number, startDeg: number, endDeg: number) => {
  const outerStart = polar(CENTER, CENTER, outerRadius, startDeg)
  const outerEnd = polar(CENTER, CENTER, outerRadius, endDeg)
  const innerStart = polar(CENTER, CENTER, innerRadius, endDeg)
  const innerEnd = polar(CENTER, CENTER, innerRadius, startDeg)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ')
}

const defaultRunner = (): RunnerState => ({ active: null, previous: null })

const pickYearDigits = (anchorDigit: number): number[] => {
  const count = 2 + Math.floor(Math.random() * 4)
  const pool = Array.from({ length: 10 }, (_, i) => i).filter((value) => value !== anchorDigit)

  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }

  return [anchorDigit, ...pool.slice(0, count - 1)].sort((a, b) => a - b)
}

const formatYear = (decade: RandomizerLabel, digit: number): string => {
  const prefixes: Record<RandomizerLabel, string> = {
    '60s': '196',
    '70s': '197',
    '80s': '198',
    '90s': '199',
    '00s': '200',
    '10s': '201',
  }

  return `${prefixes[decade]}${digit}`
}

export default function RetroVerseRandomizer({
  open,
  onClose,
  matchCount = 0,
  matchCountReady = true,
  onClearAll,
  onFinalSelection,
  selectedDecades,
  selectedDigits,
  selectedTiers,
  onToggleDecade,
  onToggleDigit,
  onToggleTier,
  size = 560,
  onSpinComplete,
  onSpinStart,
  onSpinStop,
}: RetroVerseRandomizerProps) {
  const shellStyle = useMemo(
    () =>
      ({
        '--rv-base-cream': COLOR_BASE_CREAM,
        '--rv-panel-cream': COLOR_PANEL_CREAM,
        '--rv-inner-panel': COLOR_INNER_PANEL,
        '--rv-ink-primary': COLOR_INK_PRIMARY,
        '--rv-ink-secondary': COLOR_INK_SECONDARY,
      }) as CSSProperties,
    [],
  )
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
  const yearDigitPalette = getRingPalette('yearDigit') as Record<number, string>
  const selectedDecadeSet = useMemo(() => new Set(selectedDecades ?? []), [selectedDecades])
  const selectedDigitSet = useMemo(() => new Set((selectedDigits ?? []).map((digit) => Math.trunc(digit))), [selectedDigits])
  const selectedTierSet = useMemo(() => new Set(selectedTiers ?? []), [selectedTiers])

  const timersRef = useRef<number[]>([])
  const spinTokenRef = useRef(0)

  const [decadeRunner, setDecadeRunner] = useState<RunnerState>(defaultRunner)
  const [yearRunner, setYearRunner] = useState<RunnerState>(defaultRunner)
  const [tierRunner, setTierRunner] = useState<RunnerState>(defaultRunner)
  const [spinStage, setSpinStage] = useState<SpinStage>('idle')
  const [outerRotation, setOuterRotation] = useState(0)
  const [middleRotation, setMiddleRotation] = useState(0)
  const [innerRotation, setInnerRotation] = useState(0)
  const [outerActiveIndex, setOuterActiveIndex] = useState<number | null>(null)
  const [middleActiveIndex, setMiddleActiveIndex] = useState<number | null>(null)
  const [innerActiveIndex, setInnerActiveIndex] = useState<number | null>(null)
  const [finalSelection, setFinalSelection] = useState<{ decade: number; year: number; tier: number } | null>(null)
  const [spinMode] = useState<SpinMode>('normal')
  const [wobble, setWobble] = useState(false)
  const [wobbleTime, setWobbleTime] = useState(0)
  const [shineAngle, setShineAngle] = useState(-30)
  const [shineVisible, setShineVisible] = useState(false)
  const [shineFade, setShineFade] = useState(false)
  const [revealPhase, setRevealPhase] = useState<RevealPhase>('idle')
  const [isSpinning, setIsSpinning] = useState(false)
  const [squash, setSquash] = useState(false)
  const [showReadoutYear, setShowReadoutYear] = useState(false)
  const speedBoostUntilRef = useRef<{ outer: number; middle: number; inner: number }>({ outer: 0, middle: 0, inner: 0 })

  const clearTimers = () => {
    for (const timer of timersRef.current) window.clearTimeout(timer)
    timersRef.current = []
  }

  useEffect(() => {
    return () => clearTimers()
  }, [])

  useEffect(() => {
    if (!wobble) return
    let raf = 0
    const frame = (ts: number) => {
      setWobbleTime(ts / 1000)
      raf = window.requestAnimationFrame(frame)
    }
    raf = window.requestAnimationFrame(frame)
    return () => window.cancelAnimationFrame(raf)
  }, [wobble])

  if (!open) return null

  const normalizeDeg = (deg: number) => ((deg % 360) + 360) % 360
  const getSpeedBoost = (ring: 'outer' | 'middle' | 'inner') => (performance.now() < speedBoostUntilRef.current[ring] ? 1.25 : 1)
  const nudge = (ring: 'outer' | 'middle' | 'inner') => {
    if (spinStage === 'done' || spinStage === 'idle') return
    speedBoostUntilRef.current[ring] = performance.now() + 200
  }
  const ringTransform = (rotation: number, ring: 'outer' | 'middle' | 'inner') => {
    const wobbleActive = wobble && spinStage === ring
    const wobbleScale = wobbleActive ? 1 + 0.01 * Math.sin(wobbleTime * 6) : 1
    const wobbleRot = wobbleActive ? 0.4 * Math.sin(wobbleTime * 5) : 0
    return `rotate(${rotation} ${CENTER} ${CENTER}) rotate(${wobbleRot} ${CENTER} ${CENTER}) translate(${CENTER} ${CENTER}) scale(${wobbleScale}) translate(${-CENTER} ${-CENTER})`
  }
  const activeIndexFromRotation = (rotation: number, count: number) => {
    const step = 360 / count
    const pointerAngle = normalizeDeg(360 - normalizeDeg(rotation))
    return Math.floor(pointerAngle / step) % count
  }
  const targetRotationForIndex = (currentRotation: number, count: number, index: number, extraTurns: number) => {
    const step = 360 / count
    const mid = index * step + step / 2
    const currentMid = normalizeDeg(mid + currentRotation)
    const deltaToTop = normalizeDeg(360 - currentMid)
    return currentRotation + extraTurns * 360 + deltaToTop
  }

  const animateValue = (
    ring: 'outer' | 'middle' | 'inner',
    from: number,
    to: number,
    durationMs: number,
    ease: (t: number) => number,
    token: number,
    setValue: (value: number) => void,
    onTick?: (value: number) => void,
  ) =>
    new Promise<boolean>((resolve) => {
      const started = performance.now()
      let last = started
      let progress = 0
      const frame = (now: number) => {
        if (token !== spinTokenRef.current) return resolve(false)
        const dt = Math.max(0, now - last)
        last = now
        progress += (dt * getSpeedBoost(ring)) / durationMs
        const t = Math.min(1, progress)
        const value = from + (to - from) * ease(t)
        setValue(value)
        onTick?.(value)
        if (t < 1) {
          requestAnimationFrame(frame)
        } else {
          resolve(true)
        }
      }
      requestAnimationFrame(frame)
    })

  const animateRingStage = async (params: {
    token: number
    stage: Exclude<SpinStage, 'idle' | 'done'>
    ring: 'outer' | 'middle' | 'inner'
    count: number
    finalIndex: number
    getRotation: () => number
    setRotation: (value: number) => void
    setRunner: (value: RunnerState) => void
    setActiveIndex: (value: number | null) => void
    fastMs: number
    slowMs: number
    fastTurns: number
    slowTurns: number
  }) => {
    const {
      token,
      stage,
      ring,
      count,
      finalIndex,
      getRotation,
      setRotation,
      setRunner,
      setActiveIndex,
      fastMs,
      slowMs,
      fastTurns,
      slowTurns,
    } = params
    setSpinStage(stage)
    let previous = -1
    const tick = (value: number) => {
      const active = activeIndexFromRotation(value, count)
      setActiveIndex(active)
      setRunner({ active, previous: previous >= 0 ? previous : null })
      previous = active
    }

    const fastStart = getRotation()
    const fastTarget = fastStart + fastTurns * 360
    const fastOk = await animateValue(ring, fastStart, fastTarget, fastMs, (t) => t, token, setRotation, tick)
    if (!fastOk) return false

    const slowStart = fastTarget
    const slowTarget = targetRotationForIndex(slowStart, count, finalIndex, slowTurns)
    const chaoticEase = (t: number) => Math.min(1, easeOutCubic(t) + 0.06 * Math.sin(t * 9))
    const slowEase = spinMode === 'chaotic' ? chaoticEase : easeOutCubic
    const slowOk = await animateValue(ring, slowStart, slowTarget, slowMs, slowEase, token, setRotation, tick)
    if (!slowOk) return false

    const snapTarget = targetRotationForIndex(slowTarget, count, finalIndex, 0)
    const snapOk = await animateValue(ring, slowTarget, snapTarget, 100, easeOutCubic, token, setRotation, tick)
    if (!snapOk) return false

    const bounceTarget = snapTarget + 6
    const bounceOut = await animateValue(ring, snapTarget, bounceTarget, 80, easeOutCubic, token, setRotation, tick)
    if (!bounceOut) return false
    const bounceBack = await animateValue(ring, bounceTarget, snapTarget, 120, easeOutCubic, token, setRotation, tick)
    if (!bounceBack) return false

    setActiveIndex(finalIndex)
    setRunner({ active: finalIndex, previous: previous >= 0 ? previous : null })
    return true
  }

  const startSpin = async () => {
    if (isSpinning) return

    onSpinStart?.()
    setIsSpinning(true)
    setWobble(true)
    setSquash(false)
    setShowReadoutYear(false)
    setRevealPhase('idle')
    setShineVisible(false)
    setShineFade(false)

    clearTimers()
    const token = spinTokenRef.current + 1
    spinTokenRef.current = token

    const decadeIndex = Math.floor(Math.random() * DECADE_SLICES.length)
    const yearIndex = Math.floor(Math.random() * DIGIT_SLICES.length)
    const tierIndex = Math.floor(Math.random() * TIER_SLICES.length)

    setDecadeRunner(defaultRunner())
    setYearRunner(defaultRunner())
    setTierRunner(defaultRunner())
    setFinalSelection({ decade: decadeIndex, year: yearIndex, tier: tierIndex })

    const modeConfig =
      spinMode === 'light'
        ? {
            outer: { fastMs: 900, slowMs: 650, fastTurns: 2, slowTurns: 1 },
            middle: { fastMs: 800, slowMs: 550, fastTurns: 2, slowTurns: 1 },
            inner: { fastMs: 700, slowMs: 500, fastTurns: 2, slowTurns: 1 },
          }
        : spinMode === 'chaotic'
          ? {
              outer: { fastMs: 1800, slowMs: 1200, fastTurns: 5, slowTurns: 2 },
              middle: { fastMs: 1450, slowMs: 1000, fastTurns: 5, slowTurns: 2 },
              inner: { fastMs: 1300, slowMs: 950, fastTurns: 4, slowTurns: 2 },
            }
          : {
              outer: { fastMs: 1500, slowMs: 1000, fastTurns: 4, slowTurns: 1 },
              middle: { fastMs: 1200, slowMs: 800, fastTurns: 4, slowTurns: 1 },
              inner: { fastMs: 1000, slowMs: 800, fastTurns: 3, slowTurns: 1 },
            }

    setShineVisible(true)
    setShineFade(false)
    void animateValue(
      'outer',
      -30,
      330,
      modeConfig.outer.fastMs + modeConfig.outer.slowMs,
      (t) => t,
      token,
      setShineAngle,
    )

    const outerOk = await animateRingStage({
      token,
      stage: 'outer',
      ring: 'outer',
      count: DECADE_SLICES.length,
      finalIndex: decadeIndex,
      getRotation: () => outerRotation,
      setRotation: setOuterRotation,
      setRunner: setDecadeRunner,
      setActiveIndex: setOuterActiveIndex,
      fastMs: modeConfig.outer.fastMs,
      slowMs: modeConfig.outer.slowMs,
      fastTurns: modeConfig.outer.fastTurns,
      slowTurns: modeConfig.outer.slowTurns,
    })
    if (!outerOk) return
    setShineFade(true)
    const shineOff = window.setTimeout(() => setShineVisible(false), 300)
    timersRef.current.push(shineOff)
    const middleOk = await animateRingStage({
      token,
      stage: 'middle',
      ring: 'middle',
      count: DIGIT_SLICES.length,
      finalIndex: yearIndex,
      getRotation: () => middleRotation,
      setRotation: setMiddleRotation,
      setRunner: setYearRunner,
      setActiveIndex: setMiddleActiveIndex,
      fastMs: modeConfig.middle.fastMs,
      slowMs: modeConfig.middle.slowMs,
      fastTurns: modeConfig.middle.fastTurns,
      slowTurns: modeConfig.middle.slowTurns,
    })
    if (!middleOk) return
    const innerOk = await animateRingStage({
      token,
      stage: 'inner',
      ring: 'inner',
      count: TIER_SLICES.length,
      finalIndex: tierIndex,
      getRotation: () => innerRotation,
      setRotation: setInnerRotation,
      setRunner: setTierRunner,
      setActiveIndex: setInnerActiveIndex,
      fastMs: modeConfig.inner.fastMs,
      slowMs: modeConfig.inner.slowMs,
      fastTurns: modeConfig.inner.fastTurns,
      slowTurns: modeConfig.inner.slowTurns,
    })
    if (!innerOk) return

    const decade = DECADE_SLICES[decadeIndex]
    const anchorDigit = Number(DIGIT_SLICES[yearIndex])
    const selectedYear = Number(formatYear(decade, anchorDigit))
    const result: SpinResult = {
      decade,
      year: selectedYear,
      years: pickYearDigits(anchorDigit),
      tier: TIER_SLICES[tierIndex],
    }
    onFinalSelection?.({ decade, yearDigit: anchorDigit, tier: TIER_SLICES[tierIndex] })

    setSpinStage('done')
    setWobble(false)
    setSquash(true)
    const squashTimer = window.setTimeout(() => setSquash(false), 80)
    timersRef.current.push(squashTimer)
    setRevealPhase('dim')
    const t1 = window.setTimeout(() => setRevealPhase('up'), 150)
    const t2 = window.setTimeout(() => setRevealPhase('back'), 370)
    const t3 = window.setTimeout(() => setRevealPhase('restore'), 590)
    const t4 = window.setTimeout(() => setRevealPhase('idle'), 840)
    timersRef.current.push(t1, t2, t3, t4)

    setIsSpinning(false)
    setShowReadoutYear(true)
    onSpinStop?.(result)
    onSpinComplete?.(result)
  }

  const sliceState = (runner: RunnerState, index: number): 'active' | 'trail' | 'idle' => {
    if (runner.active === index) return 'active'
    if (runner.previous === index) return 'trail'
    return 'idle'
  }

  const ringTextClass = (state: 'active' | 'trail' | 'idle', dark = false) => {
    if (dark) return `rv-randomizer-slice-text is-dark state-${state}`
    return `rv-randomizer-slice-text state-${state}`
  }

  const arcTextLength = (radius: number, stepDeg: number, pad = 0.86) => ((2 * Math.PI * radius * stepDeg) / 360) * pad
  const isReadoutRevealed = showReadoutYear && !isSpinning
  const handleClearAll = () => {
    if (isSpinning) return
    setDecadeRunner(defaultRunner())
    setYearRunner(defaultRunner())
    setTierRunner(defaultRunner())
    setShowReadoutYear(false)
    setSpinStage('idle')
    setOuterActiveIndex(null)
    setMiddleActiveIndex(null)
    setInnerActiveIndex(null)
    setFinalSelection(null)
    setWobble(false)
    setRevealPhase('idle')
    setShineVisible(false)
    setShineFade(false)
    onClearAll?.()
    onClose()
  }

  const revealActive = revealPhase === 'dim' || revealPhase === 'up' || revealPhase === 'back'
  const wedgeRevealClass = (selected: boolean) => {
    if (!revealActive) return ''
    if (selected) return ` rv-reveal-selected rv-reveal-${revealPhase}`
    return ' rv-reveal-dim'
  }

  const modal = (
    <div className="rv-randomizer-modal" role="dialog" aria-modal="true" aria-label="RetroVerse Randomizer">
      <button type="button" className="rv-randomizer-backdrop" aria-label="Close randomizer" onClick={onClose} />

      <div className="rv-randomizer-shell" style={{ ...shellStyle, width: `min(96vw, ${Math.max(320, size + 120)}px)` }}>
        <div className="rv-randomizer-title">
          RetroVerse Randomizer <span className="rv-randomizer-tm">(TM)</span>
        </div>
        <SlotCounter value={matchCount} minSlots={4} ready={matchCountReady} />

        <div
          className={`rv-randomizer-stage ${squash ? 'is-squash' : ''}${spinStage === 'done' ? ' rv-rim-wobble' : ''}`}
          style={{ width: `min(92vw, ${size}px)` }}
          data-spin-stage={spinStage}
        >
          <svg
            viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
            className="rv-randomizer-svg"
            role="img"
            aria-label="RetroVerse analog runner wheel"
            data-center-ring-radius={CENTER_RING_RADIUS}
          >
            <defs>
              <filter id="rvShadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.25" />
              </filter>
              <linearGradient id="rvShineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                <stop offset="45%" stopColor="rgba(255,255,255,0.28)" />
                <stop offset="55%" stopColor="rgba(255,255,255,0.55)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </linearGradient>
              {DECADE_SLICES.map((label, index) => {
                const step = 360 / DECADE_SLICES.length
                const start = index * step
                const end = (index + 1) * step
                const p1 = polar(CENTER, CENTER, DECADE_LABEL_RADIUS, start + 2)
                const p2 = polar(CENTER, CENTER, DECADE_LABEL_RADIUS, end - 2)
                const largeArc = end - start > 180 ? 1 : 0
                return <path key={`def-arc-${label}-${index}`} id={`arc-${label}-${index}`} d={`M ${p1.x} ${p1.y} A ${DECADE_LABEL_RADIUS} ${DECADE_LABEL_RADIUS} 0 ${largeArc} 1 ${p2.x} ${p2.y}`} />
              })}
              <pattern id="paperTexture" patternUnits="objectBoundingBox" width="4" height="4">
                <image href="/textures/paper.png" width="4" height="4" />
              </pattern>
            </defs>

            <g className="rv-arrow-anim" aria-hidden="true">
              <path className="rv-arrow-shape rv-ink-jitter-border" d={`M ${CENTER - 13} 12 L ${CENTER + 13} 12 L ${CENTER} 28 Z`} />
            </g>

            <g className={spinStage === 'done' ? 'rv-rim-wobble' : ''}>
            <g filter="url(#rvShadow)">
              <g
                transform={ringTransform(outerRotation, 'outer')}
                onClick={() => {
                  if (!isSpinning) return
                  nudge('outer')
                }}
              >
                {shineVisible && (
                  <g className={`rv-shine-layer ${shineFade ? 'is-fading' : ''}`} transform={`rotate(${shineAngle} ${CENTER} ${CENTER})`}>
                    <path d={ringPath(OUTER_RING_OUTER, OUTER_RING_INNER, 348, 18)} fill="url(#rvShineGrad)" />
                  </g>
                )}
              {DECADE_SLICES.map((label, index) => {
                const step = 360 / DECADE_SLICES.length
                const start = index * step
                const end = (index + 1) * step
                const angleMid = (((start + end) / 2 - 90) * Math.PI) / 180
                const state = sliceState(decadeRunner, index)
                const isSelected = selectedDecadeSet.has(label)
                const textRadius = DECADE_LABEL_RADIUS
                const posX = CENTER + Math.cos(angleMid) * textRadius
                const posY = CENTER + Math.sin(angleMid) * textRadius
                const ringColor = resolveRingColor('decade', DECADE_TO_YEAR[label], isSelected, 0.07, COLOR_PANEL_CREAM)

                return (
                  <g
                    key={`decade-${label}-${index}`}
                    className={`${onToggleDecade && !isSpinning ? 'rv-randomizer-clickable ' : ''}wedge${wedgeRevealClass(finalSelection?.decade === index)}`}
                    onClick={() => {
                      if (isSpinning || !onToggleDecade) return
                      onToggleDecade(label)
                    }}
                  >
                    <path
                      d={ringPath(OUTER_RING_OUTER, OUTER_RING_INNER, start, end)}
                      fill={ringColor}
                      className={`rv-randomizer-slice rv-ink-jitter-border state-${state}${state === 'active' && isReadoutRevealed ? ' is-settled' : ''}${isSelected ? ' is-manual-selected' : ''}${spinStage === 'outer' && outerActiveIndex === index ? ' rv-spin-glow' : ''}${spinStage === 'done' && finalSelection?.decade === index ? ' rv-selected-segment' : ''}`}
                      style={{ color: ringColor }}
                    />
                    <text
                      className={`${ringTextClass(state)} rv-label decade-label`}
                      x={posX}
                      y={posY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${(angleMid * 180) / Math.PI + 90}, ${posX}, ${posY})`}
                      style={{ fontSize: `${Math.min(16, Math.max(10, arcTextLength(textRadius, DECADE_TEXT_STEP) / Math.max(2, label.length)))}px` }}
                    >
                      {DECADE_DISPLAY[label]}
                    </text>
                  </g>
                )
              })}
              </g>
            </g>

            <g filter="url(#rvShadow)">
              <g
                transform={ringTransform(middleRotation, 'middle')}
                onClick={() => {
                  if (!isSpinning) return
                  nudge('middle')
                }}
              >
              {DIGIT_SLICES.map((label, index) => {
                const step = 360 / DIGIT_SLICES.length
                const start = index * step
                const end = (index + 1) * step
                const mid = (start + end) / 2
                const angleMid = ((mid - 90) * Math.PI) / 180
                const state = sliceState(yearRunner, index)
                const digit = Number(label)
                const isSelected = selectedDigitSet.has(digit)
                const textRadius = DIGIT_LABEL_RADIUS
                const posX = CENTER + Math.cos(angleMid) * textRadius
                const posY = CENTER + Math.sin(angleMid) * textRadius
                const yearDigitBaseColor = yearDigitPalette[digit]!
                const ringColor = isSelected
                  ? shiftHexLightness(yearDigitBaseColor, YEAR_DIGIT_SELECTED_LIGHTNESS_SHIFT)
                  : yearDigitBaseColor

                return (
                  <g
                    key={`digit-${label}-${index}`}
                    className={`${onToggleDigit && !isSpinning ? 'rv-randomizer-clickable ' : ''}wedge${wedgeRevealClass(finalSelection?.year === index)}`}
                    onClick={() => {
                      if (isSpinning || !onToggleDigit) return
                      onToggleDigit(digit)
                    }}
                  >
                    <path
                      d={ringPath(DIGIT_RING_OUTER, DIGIT_RING_INNER, start, end)}
                      fill={ringColor}
                      className={`rv-randomizer-slice rv-ink-jitter-border state-${state}${state === 'active' && isReadoutRevealed ? ' is-settled' : ''}${isSelected ? ' is-manual-selected' : ''}${spinStage === 'middle' && middleActiveIndex === index ? ' rv-spin-glow' : ''}${spinStage === 'done' && finalSelection?.year === index ? ' rv-selected-segment' : ''}`}
                      style={{ color: ringColor }}
                    />
                    <text
                      x={posX}
                      y={posY}
                      className={`${ringTextClass(state)} rv-label`}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${(angleMid * 180) / Math.PI + 90}, ${posX}, ${posY})`}
                      style={{ fontSize: `${Math.min(20, Math.max(13, arcTextLength(textRadius, DIGIT_TEXT_STEP) * 0.68))}px` }}
                    >
                      {label}
                    </text>
                  </g>
                )
              })}
              </g>
            </g>

            <g filter="url(#rvShadow)">
              <g
                transform={ringTransform(innerRotation, 'inner')}
                onClick={() => {
                  if (!isSpinning) return
                  nudge('inner')
                }}
              >
              {TIER_SLICES.map((label, index) => {
                const step = 360 / TIER_SLICES.length
                const start = index * step
                const end = (index + 1) * step
                const mid = (start + end) / 2
                const angleMid = ((mid - 90) * Math.PI) / 180
                const state = sliceState(tierRunner, index)
                const isSelected = selectedTierSet.has(label)
                const textRadius = (TIER_RING_OUTER + TIER_RING_INNER) / 2
                const posX = CENTER + Math.cos(angleMid) * textRadius
                const posY = CENTER + Math.sin(angleMid) * textRadius
                const ringColor = resolveRingColor('tier', label, isSelected, 0.06, COLOR_PANEL_CREAM)

                return (
                  <g
                    key={`tier-${label}-${index}`}
                    className={`${onToggleTier && !isSpinning ? 'rv-randomizer-clickable ' : ''}wedge${wedgeRevealClass(finalSelection?.tier === index)}`}
                    onClick={() => {
                      if (isSpinning || !onToggleTier) return
                      onToggleTier(label)
                    }}
                  >
                    <path
                      d={ringPath(TIER_RING_OUTER, TIER_RING_INNER, start, end)}
                      fill={ringColor}
                      className={`rv-randomizer-slice rv-ink-jitter-border state-${state}${state === 'active' && isReadoutRevealed ? ' is-settled' : ''}${isSelected ? ' is-manual-selected' : ''}${spinStage === 'inner' && innerActiveIndex === index ? ' rv-spin-glow' : ''}${spinStage === 'done' && finalSelection?.tier === index ? ' rv-selected-segment' : ''}`}
                      style={{ color: ringColor }}
                    />
                    <text
                      className="rv-tier-label rv-label"
                      x={posX}
                      y={posY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${(angleMid * 180) / Math.PI + 90}, ${posX}, ${posY})`}
                    >
                      {label}
                    </text>
                  </g>
                )
              })}
              </g>
            </g>

            </g>
            <rect x="0" y="0" width="100%" height="100%" fill="url(#paperTexture)" opacity="0.12" pointerEvents="none" />
          </svg>

          <button
            type="button"
            className="rv-randomizer-medallion"
            onClick={startSpin}
            disabled={isSpinning}
            aria-label={isSpinning ? 'Spinning…' : 'Spin'}
          >
            <img src={roundLogo} alt="" className="rv-randomizer-medallion-logo rv-logo-breathing" draggable={false} />
          </button>
        </div>

        <div className="rv-randomizer-actions">
          <button type="button" className="rv-randomizer-clear" onClick={handleClearAll} disabled={isSpinning || !onClearAll}>
            View All Videos
          </button>
          <button type="button" className="rv-randomizer-close" onClick={onClose}>
            View Filtered Videos
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
