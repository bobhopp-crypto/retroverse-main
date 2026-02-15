import { Children, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  DISPLAY_BG_GLASS,
  DISPLAY_BG_METAL,
  DISPLAY_BG_PLASTIC,
  DISPLAY_FRAME_BG,
  DISPLAY_FRAME_BORDER,
  DISPLAY_TEXT,
  DISPLAY_TEXT_SECONDARY,
} from '../design/displayTokens'
import RetroSlotDisplay from './slot/RetroSlotDisplay'
import './RetroDisplay.css'

export type RetroDisplayVariant = 'compact' | 'standard' | 'extended' | 'inline'
export type RetroDisplayMaterial = 'glass' | 'plastic' | 'metal'
export type RetroDisplayMode = 'reveal' | 'instant' | 'pulse'

export type RetroDisplayProps = {
  primary?: string
  secondary?: string
  tertiary?: string
  variant?: RetroDisplayVariant
  material?: RetroDisplayMaterial
  mode?: RetroDisplayMode
  spinProgress?: number
  children?: ReactNode
}

const REVEAL_STEP_MS = 130

const resolveType = (value: string): 'numeric' | 'alpha' => (/^\d+$/.test(value.trim()) ? 'numeric' : 'alpha')
const resolveSlots = (value: string, type: 'numeric' | 'alpha') => {
  const length = Math.max(1, value.trim().length)
  return type === 'numeric' ? Math.max(4, length) : Math.max(6, length)
}

const buildFallbackLines = ({
  primary,
  secondary,
  tertiary,
  variant,
  spinProgress,
}: Pick<RetroDisplayProps, 'primary' | 'secondary' | 'tertiary' | 'variant' | 'spinProgress'>): ReactNode[] => {
  const lines: ReactNode[] = []
  const primaryValue = primary ?? ''
  const primaryType = resolveType(primaryValue)

  lines.push(
    <RetroSlotDisplay
      key="retro-display-primary-slot"
      value={primaryValue}
      slots={resolveSlots(primaryValue, primaryType)}
      type={primaryType}
      spinProgress={spinProgress}
    />,
  )

  if (variant !== 'compact' && typeof secondary === 'string') {
    const secondaryType = resolveType(secondary)
    lines.push(
      <RetroSlotDisplay
        key="retro-display-secondary-slot"
        value={secondary}
        slots={resolveSlots(secondary, secondaryType)}
        type={secondaryType}
        spinProgress={spinProgress}
      />,
    )
  }

  if (variant === 'extended' && typeof tertiary === 'string') {
    const tertiaryType = resolveType(tertiary)
    lines.push(
      <RetroSlotDisplay
        key="retro-display-tertiary-slot"
        value={tertiary}
        slots={resolveSlots(tertiary, tertiaryType)}
        type={tertiaryType}
        spinProgress={spinProgress}
      />,
    )
  }

  return lines
}

export default function RetroDisplay({
  primary = '',
  secondary,
  tertiary,
  variant = 'standard',
  material = 'glass',
  mode = 'reveal',
  spinProgress = 1,
  children,
}: RetroDisplayProps) {
  const [visibleCount, setVisibleCount] = useState(mode === 'reveal' ? 0 : 3)
  const [pulseActive, setPulseActive] = useState(false)

  const lines = useMemo(() => {
    const childCount = Children.count(children)
    if (childCount > 0) {
      const maxLines = variant === 'compact' ? 1 : variant === 'extended' ? 3 : 2
      return Children.toArray(children).slice(0, maxLines)
    }

    return buildFallbackLines({ primary, secondary, tertiary, variant, spinProgress })
  }, [children, primary, secondary, spinProgress, tertiary, variant])

  const lineCount = lines.length

  useEffect(() => {
    if (mode === 'instant') {
      setVisibleCount(lineCount)
      setPulseActive(false)
      return
    }

    if (mode === 'pulse') {
      setVisibleCount(lineCount)
      setPulseActive(false)
      const frame = window.requestAnimationFrame(() => setPulseActive(true))
      const timer = window.setTimeout(() => setPulseActive(false), 170)
      return () => {
        window.cancelAnimationFrame(frame)
        window.clearTimeout(timer)
      }
    }

    setVisibleCount(0)
    setPulseActive(false)
    const frame = window.requestAnimationFrame(() => setVisibleCount(Math.min(1, lineCount)))
    const timers: number[] = []

    if (lineCount > 1) {
      timers.push(window.setTimeout(() => setVisibleCount(Math.min(2, lineCount)), REVEAL_STEP_MS))
    }

    if (lineCount > 2) {
      timers.push(window.setTimeout(() => setVisibleCount(Math.min(3, lineCount)), REVEAL_STEP_MS * 2))
    }

    return () => {
      window.cancelAnimationFrame(frame)
      for (const timer of timers) {
        window.clearTimeout(timer)
      }
    }
  }, [lineCount, mode, primary, secondary, tertiary])

  const windowBackground =
    material === 'plastic' ? DISPLAY_BG_PLASTIC : material === 'metal' ? DISPLAY_BG_METAL : DISPLAY_BG_GLASS

  const shellStyle = useMemo(
    () =>
      ({
        '--retro-display-frame': DISPLAY_FRAME_BG,
        '--retro-display-border': DISPLAY_FRAME_BORDER,
        '--retro-display-window-bg': windowBackground,
        '--retro-display-text': DISPLAY_TEXT,
        '--retro-display-text-secondary': DISPLAY_TEXT_SECONDARY,
      }) as CSSProperties,
    [windowBackground],
  )

  return (
    <div className={`retro-display-shell retro-display-shell--${variant} retro-display-shell--${material}`} style={shellStyle} aria-live="polite">
      <div className="retro-display-window">
        {lines.map((line, index) => {
          const levelClass =
            index === 0 ? 'retro-display-primary' : index === 1 ? 'retro-display-secondary' : 'retro-display-tertiary'
          const isVisible = mode !== 'reveal' || index < visibleCount
          const pulseClass = mode === 'pulse' && pulseActive ? ' is-pulse' : ''
          const visibleClass = isVisible ? ' is-visible' : ''

          return (
            <div key={`retro-display-line-${index}`} className={`retro-display-line ${levelClass}${visibleClass}${pulseClass}`}>
              {line}
            </div>
          )
        })}
      </div>
    </div>
  )
}
