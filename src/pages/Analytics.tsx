import { useEffect, useMemo, useState } from 'react'
import { useAtom } from 'jotai'
import historyIndexUrl from '../../artifacts/output/history-index.json?url'
import EventTypeDetailPanel from '../components/analytics/EventTypeDetailPanel'
import PlaycountBarChart from '../components/Charts/PlaycountBarChart'
import { TIER_ORDER } from '../lib/tierMapping'
import { analyticsDataAtom, chartStyleAtom } from '../state/analyticsState'
import { loadVideoIndex, type VideoRecord } from '../lib/videoIndex'
import './Analytics.css'

type HistorySessionSong = {
  videoId?: string
  filePath?: string
  playedAt?: string
  order?: number
}

type HistorySession = {
  eventType?: string
  songs?: HistorySessionSong[]
}

type HistorySongStat = {
  totalPlays?: number
  trend?: string
}

type HistoryData = {
  sessions?: HistorySession[]
  perSong?: Record<string, HistorySongStat>
  analytics?: {
    yearDistribution?: Record<string, number>
    decadeDistribution?: Record<string, number>
  }
}

type TierName = (typeof TIER_ORDER)[number]

const downloadText = (filename: string, text: string, mime: string) => {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const TIER_COLORS: Record<TierName, string> = {
  Promo: '#F3EFE2',
  Light: '#CFE2F9',
  Medium: '#CFEECF',
  Heavy: '#F4E8B0',
  Power: '#F2B8AE',
}

const toTier = (row: VideoRecord): TierName | null => {
  if (!row.tier) return null
  return TIER_ORDER.includes(row.tier as TierName) ? (row.tier as TierName) : null
}

const getDecade = (year: number | null): string | null => {
  if (typeof year !== 'number') return null
  return `${Math.floor(year / 10) * 10}s`
}

export default function Analytics() {
  const [data, setData] = useAtom(analyticsDataAtom)
  const [style, setStyle] = useAtom(chartStyleAtom)
  const [videoRows, setVideoRows] = useState<VideoRecord[]>([])
  const [selectedEventType, setSelectedEventType] = useState<string | null>(null)
  const [overviewCollapsed, setOverviewCollapsed] = useState(false)
  const [compactMode, setCompactMode] = useState(window.innerWidth < 480)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const [historyResult, videoResult] = await Promise.allSettled([
        fetch(historyIndexUrl).then((res) => {
          if (!res.ok) throw new Error(`Failed to load history-index.json (${res.status})`)
          return res.json() as Promise<HistoryData>
        }),
        loadVideoIndex(),
      ])

      if (cancelled) return

      if (historyResult.status === 'fulfilled') setData(historyResult.value)
      else setData({})

      if (videoResult.status === 'fulfilled') setVideoRows(videoResult.value)
      else setVideoRows([])
    }

    load().catch(() => {
      if (!cancelled) {
        setData({})
        setVideoRows([])
      }
    })

    return () => {
      cancelled = true
    }
  }, [setData])

  const summary = useMemo(() => {
    const perSong = data?.perSong ?? {}
    const sessions = data?.sessions ?? []
    const songs = Object.keys(perSong).length
    const totalPlays = Object.values(perSong).reduce((sum, row) => sum + (row.totalPlays ?? 0), 0)

    const eventCounts = new Map<string, number>()
    for (const session of sessions) {
      const key = session.eventType || 'Unknown'
      eventCounts.set(key, (eventCounts.get(key) ?? 0) + 1)
    }

    const eventRows = [...eventCounts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)

    const years = Object.entries(data?.analytics?.yearDistribution ?? {})
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => Number(a.label) - Number(b.label))
      .slice(-12)

    return { songs, totalPlays, sessions: sessions.length, eventRows, years, perSong }
  }, [data])

  const tierInsights = useMemo(() => {
    const tierDistribution = new Map<TierName, number>(TIER_ORDER.map((tier) => [tier, 0]))
    const yearByTier = new Map<string, number>()
    const decadeByTier = new Map<string, number>()

    for (const row of videoRows) {
      const tier = toTier(row)
      if (!tier) continue
      tierDistribution.set(tier, (tierDistribution.get(tier) ?? 0) + 1)

      if (typeof row.year === 'number') {
        const yearKey = `${row.year} ${tier}`
        yearByTier.set(yearKey, (yearByTier.get(yearKey) ?? 0) + 1)
      }

      const decade = getDecade(row.year)
      if (decade) {
        const decadeKey = `${decade} ${tier}`
        decadeByTier.set(decadeKey, (decadeByTier.get(decadeKey) ?? 0) + 1)
      }
    }

    const tierRows = TIER_ORDER.map((tier) => ({ label: tier, value: tierDistribution.get(tier) ?? 0 }))

    const tierByYearRows = [...yearByTier.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
      .slice(0, 20)

    const tierByDecadeRows = [...decadeByTier.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
      .slice(0, 20)

    return {
      tierRows,
      tierByYearRows,
      tierByDecadeRows,
    }
  }, [videoRows])

  if (!data) return <div className="section">Loading analytics...</div>

  const exportCsv = () => {
    const header = 'song_key,total_plays,trend\n'
    const lines = Object.entries(summary.perSong).map(([song, row]) => `${JSON.stringify(song)},${row.totalPlays ?? 0},${JSON.stringify(row.trend ?? '')}`)
    downloadText('history-song-stats.csv', header + lines.join('\n'), 'text/csv')
  }

  const exportPdf = () => {
    window.print()
  }

  return (
    <section className={`stack analytics-root ${compactMode ? 'compact' : 'visual'}`}>
      <div className="page-heading">
        <h1 className="page-title">Analytics</h1>
        <div className="analytics-mode-toggle">
          <button type="button" className={!compactMode ? 'active' : ''} onClick={() => setCompactMode(false)}>
            Visual
          </button>
          <span className="muted">|</span>
          <button type="button" className={compactMode ? 'active' : ''} onClick={() => setCompactMode(true)}>
            Compact
          </button>
        </div>
      </div>

      <div className="section" style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h2 className="section-title" style={{ margin: 0 }}>Overview</h2>
          <button type="button" onClick={() => setOverviewCollapsed((prev) => !prev)} style={{ padding: '4px 10px' }}>
            {overviewCollapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>

        {!overviewCollapsed ? (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <label htmlFor="chart-style">Style</label>
                <select id="chart-style" onChange={(e) => setStyle(e.target.value)} value={style}>
                  <option value="minimal">Minimal</option>
                  <option value="modern">Modern</option>
                  <option value="neon">Neon</option>
                  <option value="radio">Radio</option>
                  <option value="cartoon">Cartoon</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={exportCsv}>Export CSV</button>
                <button type="button" onClick={exportPdf}>Export PDF</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                <span className="muted">Songs</span>
                <strong>{summary.songs}</strong>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                <span className="muted">Sessions</span>
                <strong>{summary.sessions}</strong>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                <span className="muted">Plays</span>
                <strong>{summary.totalPlays}</strong>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <PlaycountBarChart
        title="Sessions by Event Type"
        values={summary.eventRows.slice(0, 8)}
        styleMode={style}
        onRowClick={(eventTypeName) => setSelectedEventType(eventTypeName)}
      />
      {selectedEventType !== null ? (
        <EventTypeDetailPanel
          eventType={selectedEventType}
          analyticsData={data}
          videoIndex={videoRows}
          onBackToSummary={() => setSelectedEventType(null)}
        />
      ) : null}
      <PlaycountBarChart title="Recent Year Activity" values={summary.years} styleMode={style} />
      <PlaycountBarChart
        title="Tier Distribution"
        values={tierInsights.tierRows}
        styleMode={style}
        colorForLabel={(label) => TIER_COLORS[label as TierName]}
      />
      <PlaycountBarChart
        title="Tier by Year (Top Buckets)"
        values={tierInsights.tierByYearRows}
        styleMode={style}
        colorForLabel={(label) => {
          const parts = label.split(' ')
          const tier = parts[parts.length - 1] as TierName
          return TIER_COLORS[tier]
        }}
      />
      <PlaycountBarChart
        title="Tier by Decade (Top Buckets)"
        values={tierInsights.tierByDecadeRows}
        styleMode={style}
        colorForLabel={(label) => {
          const parts = label.split(' ')
          const tier = parts[parts.length - 1] as TierName
          return TIER_COLORS[tier]
        }}
      />
    </section>
  )
}
