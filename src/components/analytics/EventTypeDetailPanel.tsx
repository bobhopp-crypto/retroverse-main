import { useEffect, useMemo, useState } from 'react'
import { TIER_ORDER } from '../../lib/tierMapping'
import type { VideoRecord } from '../../lib/videoIndex'

type SessionSong = {
  videoId?: string
  filePath?: string
  playedAt?: string
  order?: number
}

type SessionRow = {
  eventType?: string
  sessionId?: string
  date?: string
  songs?: SessionSong[]
}

type AnalyticsData = {
  sessions?: SessionRow[]
}

type Props = {
  eventType: string
  analyticsData: AnalyticsData
  videoIndex: VideoRecord[]
  onBackToSummary?: () => void
}

const normalizePath = (value: string): string => value.replace(/\\/g, '/').toLowerCase()

const toTrackTitle = (filePath?: string): string => {
  if (!filePath) return 'Unknown track'
  const name = filePath.split(/[/\\]/).pop() ?? filePath
  return name.replace(/\.[a-z0-9]+$/i, '')
}

const formatDate = (value?: string): string => {
  if (!value) return 'Unknown date'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

export default function EventTypeDetailPanel({ eventType, analyticsData, videoIndex, onBackToSummary }: Props) {
  const [selectedSession, setSelectedSession] = useState<string | null>(null)

  useEffect(() => {
    setSelectedSession(null)
  }, [eventType])

  const detail = useMemo(() => {
    const sessions = analyticsData.sessions ?? []
    const eventSessions = sessions.filter((session) => (session.eventType || 'Unknown') === eventType)

    const byVideoId = new Map<string, VideoRecord>()
    const byFilePath = new Map<string, VideoRecord>()
    for (const row of videoIndex) {
      if (row.videoId) byVideoId.set(row.videoId, row)
      byFilePath.set(normalizePath(row.filePath), row)
      if (row.absolutePath) byFilePath.set(normalizePath(row.absolutePath), row)
    }

    const playsByTrack = new Map<string, { videoId: string | null; filePath: string | null; plays: number }>()
    const tierCounts = new Map<string, number>(TIER_ORDER.map((tier) => [tier, 0]))
    tierCounts.set('Unknown', 0)

    let totalPlays = 0
    for (const session of eventSessions) {
      const songs = Array.isArray(session.songs) ? session.songs : []
      totalPlays += songs.length

      for (const song of songs) {
        const videoId = song.videoId?.trim() || null
        const filePath = song.filePath?.trim() || null
        const trackKey = videoId ? `id:${videoId}` : filePath ? `path:${normalizePath(filePath)}` : `unknown:${song.playedAt ?? ''}:${song.order ?? ''}`
        const existing = playsByTrack.get(trackKey)
        if (existing) existing.plays += 1
        else playsByTrack.set(trackKey, { videoId, filePath, plays: 1 })

        const video =
          (videoId ? byVideoId.get(videoId) : undefined) ||
          (filePath ? byFilePath.get(normalizePath(filePath)) : undefined) ||
          null
        const tier = video?.tier && TIER_ORDER.includes(video.tier) ? video.tier : 'Unknown'
        tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1)
      }
    }

    const topTracks = [...playsByTrack.values()]
      .map((track) => {
        const video =
          (track.videoId ? byVideoId.get(track.videoId) : undefined) ||
          (track.filePath ? byFilePath.get(normalizePath(track.filePath)) : undefined) ||
          null
        return {
          id: track.videoId || track.filePath || 'unknown-track',
          title: video?.title || toTrackTitle(track.filePath || undefined),
          count: track.plays,
        }
      })
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
      .slice(0, 5)

    const sessionsForEventType = eventSessions
      .map((session, idx) => {
        const songs = Array.isArray(session.songs) ? session.songs : []
        const sessionDate = session.date ?? songs[0]?.playedAt ?? ''
        const timestamp = Date.parse(sessionDate)
        const id = session.sessionId?.trim() || `${eventType}-${sessionDate || 'unknown'}-${idx}`

        const tracks = songs
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((song, songIdx) => {
            const videoId = song.videoId?.trim() || null
            const filePath = song.filePath?.trim() || null
            const video =
              (videoId ? byVideoId.get(videoId) : undefined) ||
              (filePath ? byFilePath.get(normalizePath(filePath)) : undefined) ||
              null
            const trackIdBase = videoId || filePath || 'unknown-track'
            return {
              id: `${id}-${trackIdBase}-${songIdx}`,
              title: video?.title || toTrackTitle(filePath || undefined),
            }
          })

        return {
          id,
          date: sessionDate,
          timestamp: Number.isFinite(timestamp) ? timestamp : 0,
          totalPlays: songs.length,
          tracks,
        }
      })
      .sort((a, b) => b.timestamp - a.timestamp || b.date.localeCompare(a.date))

    const tierDistribution = [
      ...TIER_ORDER.map((tier) => ({ name: tier, count: tierCounts.get(tier) ?? 0 })).filter((row) => row.count > 0),
      ...(tierCounts.get('Unknown') ? [{ name: 'Unknown', count: tierCounts.get('Unknown') ?? 0 }] : []),
    ]

    return {
      totalSessions: eventSessions.length,
      totalPlays,
      avgPlaysPerSession: eventSessions.length > 0 ? totalPlays / eventSessions.length : 0,
      topTracks,
      tierDistribution,
      sessionsForEventType,
    }
  }, [analyticsData, eventType, videoIndex])

  const selectedSessionDetail = useMemo(
    () => detail.sessionsForEventType.find((session) => session.id === selectedSession) ?? null,
    [detail.sessionsForEventType, selectedSession],
  )

  return (
    <section className="section analytics-detail-card">
      <div className="analytics-section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h2 className="section-title" style={{ margin: 0 }}>Event Type Detail: {eventType}</h2>
        <button type="button" onClick={onBackToSummary}>Back to Summary</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
        <div className="kpi-card" style={{ display: 'grid', gap: 2 }}>
          <h3 className="muted" style={{ margin: 0 }}>Total sessions</h3>
          <div className="kpi-value"><strong>{detail.totalSessions}</strong></div>
        </div>
        <div className="kpi-card" style={{ display: 'grid', gap: 2 }}>
          <h3 className="muted" style={{ margin: 0 }}>Total plays</h3>
          <div className="kpi-value"><strong>{detail.totalPlays}</strong></div>
        </div>
        <div className="kpi-card" style={{ display: 'grid', gap: 2 }}>
          <h3 className="muted" style={{ margin: 0 }}>Avg plays / session</h3>
          <div className="kpi-value"><strong>{detail.avgPlaysPerSession.toFixed(1)}</strong></div>
        </div>
      </div>

      <div className="event-detail-sections" style={{ marginTop: 10 }}>
        <div className="event-section">
          <h4 style={{ margin: '0 0 6px' }}>Top 5 Tracks</h4>
          {detail.topTracks.length === 0 ? (
            <p className="muted">No plays found for this event type.</p>
          ) : (
            <div>
              {detail.topTracks.map((track) => (
                <div className="track-row" key={track.id}>
                  <span className="track-title">{track.title}</span>
                  <span className="track-count">{track.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="event-section">
          <h4 style={{ margin: '0 0 6px' }}>Tier Distribution</h4>
          {detail.tierDistribution.length === 0 ? (
            <p className="muted">No tier data found for this event type.</p>
          ) : (
            <div>
              {detail.tierDistribution.map((tier) => (
                <div className="tier-row" key={tier.name}>
                  <span className="tier-name">{tier.name}</span>
                  <span className="tier-count">{tier.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <h3 className="muted" style={{ margin: '0 0 6px' }}>Sessions</h3>
        {detail.sessionsForEventType.length === 0 ? (
          <p className="muted">No sessions found for this event type.</p>
        ) : (
          <div className="session-list">
            {detail.sessionsForEventType.map((session) => (
              <div
                key={session.id}
                className="session-row"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedSession(session.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedSession(session.id)
                  }
                }}
              >
                <div className="session-date">{formatDate(session.date)}</div>
                <div className="session-stats">{session.totalPlays} plays</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedSessionDetail ? (
        <div className="session-detail">
          <h4 style={{ margin: '0 0 6px' }}>{formatDate(selectedSessionDetail.date)}</h4>
          {selectedSessionDetail.tracks.map((track) => (
            <div key={track.id} className="song-row">{track.title}</div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
