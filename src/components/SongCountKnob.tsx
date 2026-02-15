import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import styles from './SongCountKnob.module.css'

type SongCountKnobProps = {
  value: number
  onChange: (newValue: number) => void
}

const MIN_VALUE = 1
const MAX_VALUE = 50
const MIN_ANGLE = -135
const MAX_ANGLE = 135
const ANGLE_SPAN = MAX_ANGLE - MIN_ANGLE

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

const normalizeSignedAngle = (angle: number) => {
  let next = angle
  while (next > 180) next -= 360
  while (next < -180) next += 360
  return next
}

export default function SongCountKnob({ value, onChange }: SongCountKnobProps) {
  const knobRef = useRef<HTMLDivElement | null>(null)
  const activePointerId = useRef<number | null>(null)
  const releaseTimer = useRef<number | null>(null)

  const [isDragging, setIsDragging] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const [isReleaseBounce, setIsReleaseBounce] = useState(false)

  const safeValue = clamp(Math.round(value), MIN_VALUE, MAX_VALUE)
  const angle = useMemo(() => MIN_ANGLE + ((safeValue - MIN_VALUE) / (MAX_VALUE - MIN_VALUE)) * ANGLE_SPAN, [safeValue])

  const clientToValue = (clientX: number, clientY: number): number | null => {
    const node = knobRef.current
    if (!node) return null

    const rect = node.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = clientX - cx
    const dy = clientY - cy
    if (dx === 0 && dy === 0) return safeValue

    // Convert pointer angle so 0 is at top, then clamp to a 270deg arc.
    const rawDeg = (Math.atan2(dy, dx) * 180) / Math.PI
    const fromTop = normalizeSignedAngle(rawDeg + 90)
    const clampedDeg = clamp(fromTop, MIN_ANGLE, MAX_ANGLE)
    const ratio = (clampedDeg - MIN_ANGLE) / ANGLE_SPAN
    const mapped = MIN_VALUE + ratio * (MAX_VALUE - MIN_VALUE)
    return clamp(Math.round(mapped), MIN_VALUE, MAX_VALUE)
  }

  const pushValue = (clientX: number, clientY: number) => {
    const nextValue = clientToValue(clientX, clientY)
    if (nextValue === null || nextValue === safeValue) return
    onChange(nextValue)
  }

  const clearReleaseTimer = () => {
    if (releaseTimer.current) {
      window.clearTimeout(releaseTimer.current)
      releaseTimer.current = null
    }
  }

  const finishDrag = () => {
    activePointerId.current = null
    setIsDragging(false)
    setIsPressed(false)
    setIsReleaseBounce(true)
    clearReleaseTimer()
    releaseTimer.current = window.setTimeout(() => setIsReleaseBounce(false), 240)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    activePointerId.current = event.pointerId
    setIsDragging(true)
    setIsPressed(true)
    setIsReleaseBounce(false)
    event.currentTarget.setPointerCapture(event.pointerId)
    pushValue(event.clientX, event.clientY)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging || activePointerId.current !== event.pointerId) return
    pushValue(event.clientX, event.clientY)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    finishDrag()
  }

  const onPointerCancel = () => {
    finishDrag()
  }

  useEffect(
    () => () => {
      clearReleaseTimer()
    },
    [],
  )

  return (
    <div
      ref={knobRef}
      className={`${styles.shell} ${isDragging ? styles.dragging : ''} ${isPressed ? styles.pressed : ''}`}
      role="slider"
      aria-label="Song count"
      aria-valuemin={MIN_VALUE}
      aria-valuemax={MAX_VALUE}
      aria-valuenow={safeValue}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div className={styles.shadow} aria-hidden />
      <div className={styles.pointer} aria-hidden />
      <div className={styles.ring} aria-hidden />

      <div
        className={`${styles.rotor} ${isReleaseBounce ? styles.releaseBounce : ''}`}
        style={{ '--knob-angle': `${angle}deg` } as CSSProperties}
        aria-hidden
      >
        <div className={styles.tick} />
        <div className={styles.face}>
          <span className={styles.value}>{safeValue}</span>
        </div>
      </div>
    </div>
  )
}
