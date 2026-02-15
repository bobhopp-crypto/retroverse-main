import { useMemo, type CSSProperties } from 'react'
import RetroSlot from './RetroSlot'
import './RetroSlot.css'

export type RetroSlotDisplayProps = {
  value: string
  slots: number
  type: 'numeric' | 'alpha'
  spinProgress?: number
}

const NUMERIC_CHARACTERS = '0123456789'
const ALPHA_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ '

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const normalizeNumeric = (rawValue: string, slots: number) => {
  const digitsOnly = rawValue.replace(/\D/g, '').slice(-slots)
  return digitsOnly.padStart(slots, '0')
}

const normalizeAlpha = (rawValue: string, slots: number) => {
  const alphaOnly = rawValue.toUpperCase().replace(/[^A-Z ]/g, ' ').slice(0, slots)
  return alphaOnly.padEnd(slots, ' ')
}

export default function RetroSlotDisplay({ value, slots, type, spinProgress = 1 }: RetroSlotDisplayProps) {
  const safeSlots = Math.max(1, Math.trunc(slots))
  const normalizedProgress = clamp(spinProgress, 0, 1)
  const characters = type === 'numeric' ? NUMERIC_CHARACTERS : ALPHA_CHARACTERS

  const normalizedValue = useMemo(
    () => (type === 'numeric' ? normalizeNumeric(value, safeSlots) : normalizeAlpha(value, safeSlots)),
    [safeSlots, type, value],
  )

  const lineCharacters = useMemo(() => Array.from(normalizedValue), [normalizedValue])

  const style = useMemo(
    () =>
      ({
        '--retro-slot-count': `${safeSlots}`,
      }) as CSSProperties,
    [safeSlots],
  )

  return (
    <div className={`retro-slot-display retro-slot-display--${type}`} style={style} role="presentation">
      {lineCharacters.map((character, index) => (
        <RetroSlot
          key={`slot-${index}-${character}`}
          finalChar={character}
          characters={characters}
          slotIndex={index}
          totalSlots={safeSlots}
          spinProgress={normalizedProgress}
        />
      ))}
    </div>
  )
}
