import { useState } from 'react'
import RetroReadout from '../components/RetroReadout'

const YEAR_OPTIONS = ['1969', '1988', '2004'] as const
const TIER_OPTIONS = ['Promo', 'Light', 'Medium', 'Heavy', 'Power'] as const

export default function DisplayDesignLab() {
  const [year, setYear] = useState<(typeof YEAR_OPTIONS)[number]>('1969')
  const [tier, setTier] = useState<(typeof TIER_OPTIONS)[number]>('Light')

  return (
    <section className="stack">
      <div className="page-heading">
        <h1 className="page-title">Display Lab</h1>
        <span className="phase-flag">Experimentation</span>
      </div>
      <p className="muted">Standalone sandbox for the floating RetroReadout style.</p>

      <div className="section" style={{ display: 'grid', gap: 10 }}>
        <h2 className="section-title">Controls</h2>

        <div style={{ display: 'grid', gap: 8 }}>
          <div className="inline-actions" style={{ flexWrap: 'wrap' }}>
            <strong style={{ minWidth: 64 }}>Year</strong>
            {YEAR_OPTIONS.map((option) => (
              <button key={option} type="button" onClick={() => setYear(option)} style={{ background: option === year ? '#e5534b' : '#4eb3b0', color: option === year ? '#fff' : '#0b0d17' }}>
                {option}
              </button>
            ))}
          </div>

          <div className="inline-actions" style={{ flexWrap: 'wrap' }}>
            <strong style={{ minWidth: 64 }}>Tier</strong>
            {TIER_OPTIONS.map((option) => (
              <button key={option} type="button" onClick={() => setTier(option)} style={{ background: option === tier ? '#e5534b' : '#4eb3b0', color: option === tier ? '#fff' : '#0b0d17' }}>
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="section" style={{ display: 'grid', gap: 12 }}>
        <h2 className="section-title">Readout Variants</h2>
        <RetroReadout primary={year} secondary={tier} />
        <RetroReadout primary="1977" secondary="Medium" />
        <RetroReadout primary="2004" secondary="Power" />
      </div>
    </section>
  )
}
