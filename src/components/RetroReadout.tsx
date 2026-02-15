import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  DISPLAY_ANIMATION_DURATION,
  DISPLAY_BG_MINT,
  DISPLAY_OUTLINE_BROWN,
  DISPLAY_SHADOW,
  DISPLAY_TEXT_TEAL,
  DISPLAY_TEXT_TEAL_DARK,
} from '../design/displayTokens'
import './RetroReadout.css'

export type RetroReadoutProps = {
  primary: string
  secondary?: string
}

const toRgb = (hex: string) => {
  const cleaned = hex.trim().replace('#', '')
  const expanded = cleaned.length === 3 ? cleaned.split('').map((value) => `${value}${value}`).join('') : cleaned
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return '74, 139, 126'
  const red = Number.parseInt(expanded.slice(0, 2), 16)
  const green = Number.parseInt(expanded.slice(2, 4), 16)
  const blue = Number.parseInt(expanded.slice(4, 6), 16)
  return `${red}, ${green}, ${blue}`
}

const PRIMARY_GLOW = `rgba(${toRgb(DISPLAY_TEXT_TEAL_DARK)}, 0.24)`
const SECONDARY_GLOW = `rgba(${toRgb(DISPLAY_TEXT_TEAL)}, 0.2)`

export default function RetroReadout({ primary, secondary }: RetroReadoutProps) {
  const [isBouncing, setIsBouncing] = useState(false)

  useEffect(() => {
    setIsBouncing(false)
    const frame = window.requestAnimationFrame(() => setIsBouncing(true))
    const timer = window.setTimeout(() => setIsBouncing(false), DISPLAY_ANIMATION_DURATION)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [primary, secondary])

  const style = useMemo(
    () =>
      ({
        '--retro-readout-bg': DISPLAY_BG_MINT,
        '--retro-readout-outline': DISPLAY_OUTLINE_BROWN,
        '--retro-readout-shadow': DISPLAY_SHADOW,
        '--retro-readout-primary': DISPLAY_TEXT_TEAL_DARK,
        '--retro-readout-secondary': DISPLAY_TEXT_TEAL,
        '--retro-readout-primary-glow': PRIMARY_GLOW,
        '--retro-readout-secondary-glow': SECONDARY_GLOW,
        '--retro-readout-bounce-ms': `${DISPLAY_ANIMATION_DURATION}ms`,
      }) as CSSProperties,
    [],
  )

  return (
    <div className={`retro-readout ${isBouncing ? 'is-bouncing' : ''}`} style={style} aria-live="polite">
      <p className="retro-readout-primary">{primary}</p>
      {secondary ? <p className="retro-readout-secondary">{secondary}</p> : null}
    </div>
  )
}
