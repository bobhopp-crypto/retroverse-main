import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import styles from './SlotCounter.module.css'

declare const __DEV__: boolean | undefined

type SlotCounterProps = {
  value: number
  minSlots?: number
  ready?: boolean
  debugOutline?: boolean
}

const REEL_SYMBOLS = [' ', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
const DEFAULT_MIN_SLOTS = 4
const IS_DEV = import.meta.env.DEV || (typeof __DEV__ !== 'undefined' && Boolean(__DEV__))

const clampCount = (value: number) => Math.max(0, Number.isFinite(value) ? Math.trunc(value) : 0)

function SlotReel({ symbol }: { symbol: string }) {
  const index = REEL_SYMBOLS.indexOf(symbol)
  const safeIndex = index >= 0 ? index : 0

  return (
    <div className={styles.rvSlotReel} aria-hidden="true">
      <div
        className={styles.rvSlotStack}
        style={{
          transform: `translateY(-${safeIndex}em)`,
          transition: 'transform 220ms ease-out',
        }}
      >
        {REEL_SYMBOLS.map((value) => (
          <span key={value} className={styles.rvSlotGlyph}>
            {value === ' ' ? '\u00A0' : value}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function SlotCounter({
  value,
  minSlots = DEFAULT_MIN_SLOTS,
  ready = true,
  debugOutline = false,
}: SlotCounterProps) {
  const safeValue = clampCount(value)
  const safeMinSlots = Math.max(1, Math.trunc(minSlots))
  const countDigits = String(safeValue).length

  const [slotCount, setSlotCount] = useState(() => Math.max(safeMinSlots, countDigits))
  const [isPrimed, setIsPrimed] = useState(false)

  useEffect(() => {
    const requiredSlots = Math.max(safeMinSlots, countDigits)
    setSlotCount((current) => (requiredSlots > current ? requiredSlots : current))
  }, [countDigits, safeMinSlots])

  useEffect(() => {
    if (!ready || isPrimed) return
    setIsPrimed(true)
  }, [isPrimed, ready])

  const padded = useMemo(() => String(safeValue).padStart(slotCount, '0'), [safeValue, slotCount])
  const renderedSymbols = useMemo(() => (isPrimed ? padded : ''.padStart(slotCount, ' ')), [isPrimed, padded, slotCount])

  const style = useMemo(
    () =>
      ({
        '--rv-slot-count': `${slotCount}`,
      }) as CSSProperties,
    [slotCount],
  )
  const debugClass = debugOutline && IS_DEV ? ` ${styles.rvSlotCounterDebug}` : ''

  console.log('[SlotCounter]', { value, slotCount, renderedSymbols })

  return (
    <div
      className={`${styles.rvSlotCounter}${debugClass}`}
      style={style}
      aria-live="polite"
      aria-label={`${safeValue} matching videos`}
    >
      <div className={styles.rvSlotLabel}>MATCHES</div>
      <div className={styles.rvSlotWindow}>
        <div className={styles.rvSlotReels}>
          {Array.from(renderedSymbols).map((symbol, index) => (
            <SlotReel key={`slot-${index}`} symbol={symbol} />
          ))}
        </div>
      </div>
    </div>
  )
}
