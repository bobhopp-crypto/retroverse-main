import { useMemo, useState } from 'react'
import './SetBuilderRings.css'

// ---------------------------------------------
// TEMP INTERFACE — replace later with real data
// ---------------------------------------------
interface VideoItem {
  artist: string
  title: string
  year: number
  rotation: string // Promo, Light, Medium, Heavy, Power
  recencyDays: number
}

const MOCK_DATA: VideoItem[] = [] // Will be replaced by real dataset injection

// ---------------------------------------------
// MAIN COMPONENT — CLEAN SLATE
// ---------------------------------------------
export default function SetBuilderRings() {
  // CENTER YEAR (main selector)
  const [centerYear, setCenterYear] = useState(1980)

  // SPAN (1–15 years or FULL)
  const [spanYears, setSpanYears] = useState(10)

  // ROTATION TIER
  const [tier, setTier] = useState<string | null>(null)

  // COUNT RING (5 choices)
  const [count, setCount] = useState(20)

  // RECENCY
  const [recency] = useState<number | null>(null)

  // ---------------------------------------------
  // MATCH CALCULATION (placeholder – replace later)
  // ---------------------------------------------
  const matches = useMemo(() => {
    return MOCK_DATA.length // replace with real filter pipeline
  }, [centerYear, spanYears, tier, count, recency])

  // ---------------------------------------------
  // RENDER
  // ---------------------------------------------
  return (
    <div className="sb-container">
      <div className="sb-header">
        <h1 className="sb-title">SET BUILDER</h1>
        <div className="sb-stats">
          <div>
            TIME RANGE: {centerYear - spanYears} → {centerYear + spanYears}
          </div>
          <div>SPAN: {spanYears} YEARS</div>
          <div>TIER: {tier ?? 'AUTO'}</div>
          <div>RECENCY: {recency ?? 'ALL'}</div>
          <div>MATCHES: {matches}</div>
        </div>
      </div>

      {/* ----------------------------------------------------------
          MASTER RING SYSTEM
      ----------------------------------------------------------- */}
      <div className="sb-ring-wrapper">
        {/* OUTER RING — DECADE / YEAR SELECTOR */}
        <div className="sb-ring sb-ring-outer">
          <div className="sb-ring-label">YEAR</div>
          <div className="sb-year-display">{centerYear}</div>

          <button className="sb-year-btn left" onClick={() => setCenterYear((y) => y - 1)}>
            ◄
          </button>
          <button className="sb-year-btn right" onClick={() => setCenterYear((y) => y + 1)}>
            ►
          </button>
        </div>

        {/* MID RING — SPAN */}
        <div className="sb-ring sb-ring-mid">
          <div className="sb-ring-label">SPAN</div>

          <div className="sb-span-options">
            {[1, 3, 5, 7, 10, 15].map((v) => (
              <button
                key={v}
                className={v === spanYears ? 'sb-span-btn active' : 'sb-span-btn'}
                onClick={() => setSpanYears(v)}
              >
                {v}y
              </button>
            ))}

            <button
              className={spanYears === 99 ? 'sb-span-btn active' : 'sb-span-btn'}
              onClick={() => setSpanYears(99)}
            >
              FULL
            </button>
          </div>
        </div>

        {/* INNER RING — ROTATION TIER */}
        <div className="sb-ring sb-ring-inner">
          <div className="sb-ring-label">TIER</div>

          {['Promo', 'Light', 'Medium', 'Heavy', 'Power'].map((t) => (
            <button
              key={t}
              className={tier === t ? 'sb-tier-btn active' : 'sb-tier-btn'}
              onClick={() => setTier(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* CENTER — COUNT */}
        <div className="sb-center">
          <div className="sb-center-value">{count}</div>

          <div className="sb-count-options">
            {[5, 10, 15, 20, 25].map((v) => (
              <button
                key={v}
                className={v === count ? 'sb-count-btn active' : 'sb-count-btn'}
                onClick={() => setCount(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------
          ACTION BUTTONS
      ----------------------------------------------------------- */}
      <div className="sb-actions">
        <button className="sb-act-btn primary">Generate</button>
        <button className="sb-act-btn">Add to Queue</button>
        <button className="sb-act-btn">Replace Queue</button>
      </div>
    </div>
  )
}
