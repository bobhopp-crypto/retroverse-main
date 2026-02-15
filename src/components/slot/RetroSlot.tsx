import { useEffect, useMemo, useRef, useState } from 'react'

type RetroSlotProps = {
  finalChar: string
  characters: string
  slotIndex: number
  totalSlots: number
  spinProgress: number
}

type SlotPhase = 'spin' | 'overshoot' | 'snap' | 'jitter-a' | 'jitter-b' | 'settled'

const STACK_REPEAT_COUNT = 24
const SPIN_BASE_CYCLES = 7
const SPIN_CYCLE_SPREAD = 1.45
const JITTER_STEPS = 0.05

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const easeOutQuart = (t: number) => 1 - (1 - t) ** 4

const resolveFinalIndex = (characters: string[], finalChar: string) => {
  const exact = characters.indexOf(finalChar)
  if (exact >= 0) return exact
  const blank = characters.indexOf(' ')
  if (blank >= 0) return blank
  return 0
}

export default function RetroSlot({ finalChar, characters, slotIndex, totalSlots, spinProgress }: RetroSlotProps) {
  const characterList = useMemo(() => Array.from(characters), [characters])
  const characterCount = Math.max(1, characterList.length)
  const safeTotalSlots = Math.max(1, totalSlots)
  const lockThreshold = (slotIndex + 1) / safeTotalSlots
  const normalizedProgress = clamp(spinProgress, 0, 1)
  const isLocked = normalizedProgress >= lockThreshold

  const [position, setPosition] = useState(slotIndex * 2.2)
  const [phase, setPhase] = useState<SlotPhase>('settled')

  const progressRef = useRef(normalizedProgress)
  const positionRef = useRef(position)
  const rafRef = useRef<number | null>(null)
  const timersRef = useRef<number[]>([])
  const hadUnlockedRef = useRef(false)

  progressRef.current = normalizedProgress
  positionRef.current = position

  const stackCharacters = useMemo(() => {
    const stack: string[] = []
    for (let repeat = 0; repeat < STACK_REPEAT_COUNT; repeat += 1) {
      stack.push(...characterList)
    }
    return stack
  }, [characterList])

  const clearTimers = () => {
    for (const timer of timersRef.current) {
      window.clearTimeout(timer)
    }
    timersRef.current = []
  }

  const stopAnimationFrame = () => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      stopAnimationFrame()
      clearTimers()
    }
  }, [])

  useEffect(() => {
    if (isLocked) return

    hadUnlockedRef.current = true
    clearTimers()
    stopAnimationFrame()
    setPhase('spin')

    const cycles = SPIN_BASE_CYCLES + (safeTotalSlots - slotIndex - 1) * SPIN_CYCLE_SPREAD
    const distance = Math.max(characterCount, cycles * characterCount)
    const startOffset = slotIndex * 2.2

    const frame = () => {
      const localProgress = clamp(progressRef.current / lockThreshold, 0, 0.999)
      const eased = easeOutQuart(localProgress)
      const nextPosition = startOffset + distance * eased
      positionRef.current = nextPosition
      setPosition(nextPosition)

      if (progressRef.current < lockThreshold) {
        rafRef.current = window.requestAnimationFrame(frame)
      } else {
        rafRef.current = null
      }
    }

    rafRef.current = window.requestAnimationFrame(frame)

    return () => {
      stopAnimationFrame()
    }
  }, [characterCount, isLocked, lockThreshold, safeTotalSlots, slotIndex])

  useEffect(() => {
    if (!isLocked) return

    clearTimers()
    stopAnimationFrame()

    const finalIndex = resolveFinalIndex(characterList, finalChar)
    const current = positionRef.current
    const minimumTarget = current + 0.1
    let target = Math.ceil((minimumTarget - finalIndex) / characterCount) * characterCount + finalIndex
    if (target < minimumTarget) {
      target += characterCount
    }

    if (!hadUnlockedRef.current) {
      positionRef.current = target
      setPosition(target)
      setPhase('settled')
      return
    }

    hadUnlockedRef.current = false

    const overshoot = target + 1
    const jitterUp = target + JITTER_STEPS
    const jitterDown = target - JITTER_STEPS

    setPhase('overshoot')
    positionRef.current = overshoot
    setPosition(overshoot)

    const snapTimer = window.setTimeout(() => {
      setPhase('snap')
      positionRef.current = target
      setPosition(target)
    }, 92)

    const jitterUpTimer = window.setTimeout(() => {
      setPhase('jitter-a')
      positionRef.current = jitterUp
      setPosition(jitterUp)
    }, 146)

    const jitterDownTimer = window.setTimeout(() => {
      setPhase('jitter-b')
      positionRef.current = jitterDown
      setPosition(jitterDown)
    }, 188)

    const settleTimer = window.setTimeout(() => {
      setPhase('settled')
      positionRef.current = target
      setPosition(target)
    }, 236)

    timersRef.current.push(snapTimer, jitterUpTimer, jitterDownTimer, settleTimer)

    return () => {
      clearTimers()
    }
  }, [characterCount, characterList, finalChar, isLocked])

  return (
    <div className={`retro-slot retro-slot--${phase}`} aria-hidden="true">
      <div className="retro-slot-viewport">
        <div className="retro-slot-stack" style={{ transform: `translateY(${(-position).toFixed(4)}em)` }}>
          {stackCharacters.map((glyph, index) => (
            <span key={`${glyph}-${index}`} className="retro-slot-glyph">
              {glyph === ' ' ? '\u00A0' : glyph}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
