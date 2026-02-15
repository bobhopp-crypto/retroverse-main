import { useEffect, useMemo, useState } from 'react'
import './CRTDisplay.css'

type CRTDisplayProps = {
  year: number | null
  tier: string | null
  isRevealing: boolean
}

const SCRAMBLE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#!?'

const scrambleText = (length: number) =>
  Array.from({ length }, () => SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]).join('')

export default function CRTDisplay({ year, tier, isRevealing }: CRTDisplayProps) {
  const finalYear = useMemo(() => (typeof year === 'number' ? String(year) : ''), [year])
  const finalTier = useMemo(() => (tier?.toUpperCase() || ''), [tier])

  const [displayYear, setDisplayYear] = useState(finalYear)
  const [displayTier, setDisplayTier] = useState(finalTier)
  const [snapGlow, setSnapGlow] = useState(false)

  useEffect(() => {
    let frameTimer = 0
    let clearGlowTimer = 0
    const hasFinalText = finalYear.length > 0 || finalTier.length > 0

    if (isRevealing) {
      setSnapGlow(false)
      frameTimer = window.setInterval(() => {
        setDisplayYear(scrambleText(Math.max(4, finalYear.length)))
        setDisplayTier(scrambleText(Math.max(4, finalTier.length)))
      }, 75)
    } else if (!hasFinalText) {
      setSnapGlow(false)
      setDisplayYear('')
      setDisplayTier('')
    } else {
      const frames = 6 + Math.floor(Math.random() * 7)
      let count = 0
      frameTimer = window.setInterval(() => {
        count += 1
        if (count < frames) {
          setDisplayYear(scrambleText(Math.max(4, finalYear.length)))
          setDisplayTier(scrambleText(Math.max(4, finalTier.length)))
          return
        }
        window.clearInterval(frameTimer)
        setDisplayYear(finalYear)
        setDisplayTier(finalTier)
        setSnapGlow(true)
        clearGlowTimer = window.setTimeout(() => setSnapGlow(false), 620)
      }, 65)
    }

    return () => {
      window.clearInterval(frameTimer)
      window.clearTimeout(clearGlowTimer)
    }
  }, [finalTier, finalYear, isRevealing])

  return (
    <div className={`rv-crt-display ${isRevealing ? 'is-revealing' : ''}`} aria-live="polite">
      <div className="rv-crt-frame">
        <div className={`rv-crt-screen ${snapGlow ? 'is-snap' : ''}`}>
          <div className="rv-crt-scanlines" aria-hidden />
          <div className="rv-crt-text-wrap">
            <span className={`rv-crt-year ${isRevealing ? 'is-scrambling' : ''}`}>{displayYear}</span>
            <span className={`rv-crt-tier ${isRevealing ? 'is-scrambling' : ''}`}>{displayTier}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
