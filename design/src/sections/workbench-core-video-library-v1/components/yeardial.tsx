import { useRef, useState } from 'react'

const STEP_PX = 24 // pixels per year
const DEADZONE_PX = 12 // ignore tiny movement

interface YearDialProps {
  minYear: number
  maxYear: number
  value: number
  onChange: (year: number) => void
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/**
 * YearDial Component — v1 (Isolated)
 * 
 * One-line control with:
 * - Left: All/Range toggle
 * - Center: Round dial for drag-to-change year
 * - Right: Year display
 * 
 * Behavior:
 * - Drag left/right to change year
 * - Discrete steps (1 year per 24px)
 * - Deadzone prevents jitter (12px)
 * - No momentum, no animations
 * - Pointer Events API only
 */
export function YearDial({ minYear, maxYear, value, onChange }: YearDialProps) {
  const [mode, setMode] = useState<'all' | 'range'>('all')
  const dragStartXRef = useRef(0)
  const startYearRef = useRef(0)
  const draggingRef = useRef(false)
  const lastYearRef = useRef(value)

  // Sync lastYearRef when value prop changes (but not during drag)
  if (!draggingRef.current && value !== lastYearRef.current) {
    lastYearRef.current = value
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true
    dragStartXRef.current = e.clientX
    startYearRef.current = value
    lastYearRef.current = value
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return

    const delta = e.clientX - dragStartXRef.current

    if (Math.abs(delta) < DEADZONE_PX) return

    const steps = Math.trunc(delta / STEP_PX)
    if (steps === 0) return

    const nextYear = clamp(startYearRef.current + steps, minYear, maxYear)

    // Use lastYearRef to avoid stale closure issues
    if (nextYear !== lastYearRef.current) {
      onChange(nextYear)
      console.log(nextYear)

      // Reset reference point after step
      dragStartXRef.current = e.clientX
      startYearRef.current = nextYear
      lastYearRef.current = nextYear
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    draggingRef.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const handlePointerCancel = (e: React.PointerEvent) => {
    draggingRef.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      {/* Left: All/Range toggle */}
      <div className="flex gap-1 shrink-0">
        <button
          onClick={() => setMode('all')}
          className={`px-3 py-1 rounded text-sm transition-colors ${
            mode === 'all'
              ? 'bg-[var(--rv-bg-hover)]'
              : 'bg-transparent hover:text-[var(--rv-text)]'
          }`}
          style={mode === 'all' ? { color: 'var(--rv-text)' } : { color: 'var(--rv-text-muted)' }}
        >
          All
        </button>
        <button
          onClick={() => setMode('range')}
          className={`px-3 py-1 rounded text-sm transition-colors ${
            mode === 'range'
              ? 'bg-[var(--rv-bg-hover)]'
              : 'bg-transparent hover:text-[var(--rv-text)]'
          }`}
          style={mode === 'range' ? { color: 'var(--rv-text)' } : { color: 'var(--rv-text-muted)' }}
        >
          Range
        </button>
      </div>

      {/* Center: Round dial */}
      <div
        className="w-16 h-16 rounded-full border-2 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none shrink-0"
        style={{ touchAction: 'none', background: 'var(--rv-bg-hover)', borderColor: 'var(--rv-border)' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        role="slider"
        aria-valuemin={minYear}
        aria-valuemax={maxYear}
        aria-valuenow={value}
        aria-label={`Year dial: ${value}`}
      >
        <div className="text-center">
          <div className="text-lg font-bold leading-none" style={{ color: 'var(--rv-text)' }}>
            {value}
          </div>
        </div>
      </div>

      {/* Right: Year display */}
      <div className="text-right shrink-0">
        <div className="text-sm font-mono" style={{ color: 'var(--rv-text-muted)' }}>
          {value}
        </div>
        <div className="text-xs opacity-60" style={{ color: 'var(--rv-text-muted)' }}>
          {minYear}–{maxYear}
        </div>
      </div>
    </div>
  )
}
