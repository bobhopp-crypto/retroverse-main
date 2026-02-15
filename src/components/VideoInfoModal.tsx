import { useMemo, useState } from 'react'
import type { VideoRecord } from '../lib/videoIndex'
import { formatFriendlyAge, getRelativeVideoPath } from '../lib/videoIndex'
import './VideoInfoModal.css'

type Props = {
  video: VideoRecord | null
  onClose: () => void
  onAddToQueue: (video: VideoRecord) => void
}

const EXCLUDED_OVERVIEW_KEYS = new Set([
  'title',
  'artist',
  'album',
  'genre',
  'label',
  'bpm',
  'key',
  'playcount',
  'playCount',
  'play_count',
  'firstSeen',
  'first_seen',
  'first_seen_ts',
  'comments',
  'filePath',
  'filepath',
  'duration',
  'durationSeconds',
  'duration_sec',
  'videoId',
  'video_id',
  'tags',
  'infos',
  'scan',
  'pois',
  'retentionScore',
  'retention_score',
  'retentionGrade',
  'retention_grade',
  'retentionStars',
  'retention_stars',
  'retentionStrength',
  'retention_strength',
  'retentionIndicator',
  'retention_indicator',
  'retentionBreakdown',
  'retention_breakdown',
])

const toDisplayText = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const sectionEntries = (value: unknown): Array<[string, unknown]> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value as Record<string, unknown>)
}

export default function VideoInfoModal({ video, onClose, onAddToQueue }: Props) {
  const [expandedPath, setExpandedPath] = useState(false)
  const [inlinePlay, setInlinePlay] = useState(false)
  const [showMoreMetadata, setShowMoreMetadata] = useState(false)

  const details = useMemo(() => {
    if (!video) return [] as Array<[string, unknown]>
    return Object.entries(video.raw).filter(([key]) => !EXCLUDED_OVERVIEW_KEYS.has(key))
  }, [video])

  if (!video) return null

  const firstSeenLabel = video.firstSeenMs ? new Date(video.firstSeenMs).toLocaleDateString() : 'Unknown'
  const relativePath = getRelativeVideoPath(video.absolutePath || video.filePath)

  return (
    <div className="rv-modal-scrim" role="dialog" aria-modal="true" aria-label="Video info" onClick={onClose}>
      <div className="rv-info-modal" onClick={(event) => event.stopPropagation()}>
        <header className="rv-info-topbar">
          <strong>Track Info</strong>
          <button type="button" onClick={onClose} aria-label="Close info modal">
            Close
          </button>
        </header>

        <div className="rv-info-body">
          <button
            type="button"
            className="rv-info-media"
            onClick={() => setInlinePlay((prev) => !prev)}
            aria-label={inlinePlay ? 'Show thumbnail' : 'Play inline'}
          >
            {inlinePlay && video.videoUrl ? (
              <video src={video.videoUrl} poster={video.thumbnailUrl} controls playsInline autoPlay />
            ) : video.thumbnailUrl ? (
              <img src={video.thumbnailUrl} alt="" loading="lazy" />
            ) : (
              <div className="rv-thumb-fallback" />
            )}
          </button>

          <div className="rv-info-main">
            <h2>{video.title}</h2>
            <p>{video.artist}</p>
            <button
              type="button"
              className="rv-add-btn"
              onClick={() => {
                onAddToQueue(video)
              }}
            >
              Add to Playlist
            </button>
          </div>

          <section className="rv-overview-grid">
            <div>
              <span>Title</span>
              <strong>{video.title}</strong>
            </div>
            <div>
              <span>Artist</span>
              <strong>{video.artist}</strong>
            </div>
            <div>
              <span>Album</span>
              <strong>{video.album}</strong>
            </div>
            <div>
              <span>Genre</span>
              <strong>{video.genre}</strong>
            </div>
            <div>
              <span>Label</span>
              <strong>{video.label}</strong>
            </div>
            <div>
              <span>BPM + Key</span>
              <strong>
                {video.bpm} / {video.key}
              </strong>
            </div>
            <div>
              <span>Playcount</span>
              <strong>{video.playcount}</strong>
            </div>
            <div>
              <span>Retention</span>
              <strong>
                {video.retentionScore} ({video.retentionGrade})
              </strong>
              <small>{video.retentionIndicator}</small>
            </div>
            <div>
              <span>FirstSeen</span>
              <strong>{formatFriendlyAge(video.firstSeenMs)}</strong>
              <small>{firstSeenLabel}</small>
            </div>
            <div>
              <span>Comments</span>
              <strong>{video.comments}</strong>
            </div>
            <div>
              <span>File path</span>
              <button type="button" className="rv-path-toggle" onClick={() => setExpandedPath((prev) => !prev)}>
                {expandedPath ? video.absolutePath || video.filePath : relativePath}
              </button>
            </div>

            <div>
              <span>VDJ Infos</span>
              <strong>{sectionEntries(video.infos).length} fields</strong>
            </div>

            <div>
              <span>Scan fields</span>
              <strong>{sectionEntries(video.scan).length} fields</strong>
            </div>

            <div>
              <span>Tags</span>
              <strong>{sectionEntries(video.tags).length} fields</strong>
            </div>

            <div>
              <span>POIs</span>
              <strong>{video.pois.length} points</strong>
            </div>

            <div>
              <span>Link metadata</span>
              <strong>{details.some(([key]) => key === 'link') ? 'Available' : '—'}</strong>
            </div>
          </section>

          <button type="button" className="rv-more-btn" onClick={() => setShowMoreMetadata((prev) => !prev)}>
            {showMoreMetadata ? 'Hide More Metadata' : 'More Metadata'}
          </button>

          {showMoreMetadata && (
            <div className="rv-more-sections">
              <section>
                <h4>Core metadata</h4>
                <dl>
                  {details.length === 0 ? (
                    <div>
                      <dt>raw</dt>
                      <dd>—</dd>
                    </div>
                  ) : (
                    details.map(([key, value]) => (
                      <div key={`raw-core-${key}`}>
                        <dt>{key}</dt>
                        <dd>{toDisplayText(value)}</dd>
                      </div>
                    ))
                  )}
                </dl>
              </section>

              <section>
                <h4>VDJ Infos</h4>
                {sectionEntries(video.infos).length === 0 ? (
                  <p>—</p>
                ) : (
                  <dl>
                    {sectionEntries(video.infos).map(([key, value]) => (
                      <div key={`info-${key}`}>
                        <dt>{key}</dt>
                        <dd>{toDisplayText(value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>

              <section>
                <h4>Scan fields</h4>
                {sectionEntries(video.scan).length === 0 ? (
                  <p>—</p>
                ) : (
                  <dl>
                    {sectionEntries(video.scan).map(([key, value]) => (
                      <div key={`scan-${key}`}>
                        <dt>{key}</dt>
                        <dd>{toDisplayText(value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>

              <section>
              <h4>Tags</h4>
              {sectionEntries(video.tags).length === 0 ? (
                <p>—</p>
              ) : (
                <dl>
                  {sectionEntries(video.tags).map(([key, value]) => (
                    <div key={`tag-${key}`}>
                      <dt>{key}</dt>
                      <dd>{toDisplayText(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              </section>

              <section>
                <h4>POIs</h4>
                <pre>{video.pois.length > 0 ? JSON.stringify(video.pois, null, 2) : '[]'}</pre>
              </section>

              <section>
                <h4>Retention Breakdown</h4>
                {!video.retentionBreakdown ? (
                  <p>—</p>
                ) : (
                  <dl>
                    {Object.entries(video.retentionBreakdown).map(([key, value]) => (
                      <div key={`retention-${key}`}>
                        <dt>{key}</dt>
                        <dd>{Math.round(value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>

              <section>
                <h4>Link metadata</h4>
                <dl>
                  {sectionEntries(video.raw.link).length === 0 ? (
                    <div>
                      <dt>link</dt>
                      <dd>—</dd>
                    </div>
                  ) : (
                    sectionEntries(video.raw.link).map(([key, value]) => (
                      <div key={`link-${key}`}>
                        <dt>{key}</dt>
                        <dd>{toDisplayText(value)}</dd>
                      </div>
                    ))
                  )}
                </dl>
              </section>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
