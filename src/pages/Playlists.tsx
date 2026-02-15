import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from 'react'
import { usePlaylistContext } from '../context/PlaylistContext'
import { formatDuration, formatYear, type VideoRecord } from '../lib/videoIndex'
import './Playlists.css'

type QueueDragState = {
  itemId: string
  pointerId: number
  originIndex: number
  targetIndex: number
  startY: number
  currentY: number
}

type QueueTouchState = {
  rowId: string | null
  startX: number
  startY: number
  baseOffset: number
  lock: 'undecided' | 'horizontal' | 'vertical'
  leftDistance: number
}

const SWIPE_ACTION_WIDTH = 106
const SWIPE_REVEAL_THRESHOLD = 34
const SWIPE_LOCK_THRESHOLD = 12

type PlaylistTierKey = 'promo' | 'light' | 'medium' | 'heavy' | 'power'

const inferTierKeyFromPlaycount = (playcount: number): PlaylistTierKey => {
  if (playcount <= 1) return 'promo'
  if (playcount <= 7) return 'light'
  if (playcount <= 15) return 'medium'
  if (playcount <= 29) return 'heavy'
  return 'power'
}

const resolvePlaylistTierKey = (item: VideoRecord): PlaylistTierKey => {
  const normalizedTier = item.tier?.toLowerCase()
  if (normalizedTier === 'promo') return 'promo'
  if (normalizedTier === 'light') return 'light'
  if (normalizedTier === 'medium') return 'medium'
  if (normalizedTier === 'heavy') return 'heavy'
  if (normalizedTier === 'power') return 'power'
  return inferTierKeyFromPlaycount(item.playcount)
}

const formatHhMmSs = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds))
  const hh = Math.floor(total / 3600)
  const mm = Math.floor((total % 3600) / 60)
  const ss = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

const toCsvSafe = (value: string | number) => {
  const text = String(value ?? '')
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

const downloadBlob = (filename: string, content: string, mime: string) => {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const exportQueue = (items: VideoRecord[], format: 'm3u' | 'csv') => {
  if (format === 'm3u') {
    const body = items.map((item) => `${item.artist} - ${item.title}`).join('\n')
    downloadBlob('queue.m3u', body, 'audio/x-mpegurl')
    return
  }

  const header = ['title', 'artist', 'year', 'duration', 'playcount', 'filepath']
  const rows = items.map((item) =>
    [
      toCsvSafe(item.title),
      toCsvSafe(item.artist),
      toCsvSafe(item.year ?? '—'),
      toCsvSafe(formatDuration(item.durationSec)),
      toCsvSafe(item.playcount),
      toCsvSafe(item.absolutePath || item.filePath),
    ].join(','),
  )
  downloadBlob('queue.csv', [header.join(','), ...rows].join('\n'), 'text/csv;charset=utf-8')
}

type QueueRowProps = {
  item: VideoRecord
  dragOffset: number | null
  isDragging: boolean
  isDropTarget: boolean
  dragLiftY: number
  onPlay: () => void
  onThumbPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onThumbPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onThumbPointerEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onThumbDragStart: (event: React.DragEvent<HTMLButtonElement>) => void
  onThumbDragEnd: () => void
  onRowDragOver: (event: React.DragEvent<HTMLElement>) => void
  onRowDrop: (event: React.DragEvent<HTMLElement>) => void
  onTouchStart: (event: ReactTouchEvent<HTMLElement>, row: VideoRecord) => void
  onTouchMove: (event: ReactTouchEvent<HTMLElement>) => void
  onTouchEnd: () => void
  onRemoveClick: () => void
}

function QueueRow({
  item,
  dragOffset,
  isDragging,
  isDropTarget,
  dragLiftY,
  onPlay,
  onThumbPointerDown,
  onThumbPointerMove,
  onThumbPointerEnd,
  onThumbDragStart,
  onThumbDragEnd,
  onRowDragOver,
  onRowDrop,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onRemoveClick,
}: QueueRowProps) {
  const translateX = dragOffset ?? 0
  const tierKey = resolvePlaylistTierKey(item)

  return (
    <article
      className={`plq-row-shell plq-row-shell--${tierKey} ${isDragging ? 'is-dragging' : ''} ${isDropTarget ? 'is-drop-target' : ''}`}
      data-queue-id={item.id}
      onDragOver={onRowDragOver}
      onDrop={onRowDrop}
      onTouchStart={(event) => onTouchStart(event, item)}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div className="plq-row-surface" style={{ transform: `translate(${translateX}px, ${dragLiftY}px)` }}>
        <button
          type="button"
          className="plq-thumb-handle"
          onPointerDown={onThumbPointerDown}
          onPointerMove={onThumbPointerMove}
          onPointerUp={onThumbPointerEnd}
          onPointerCancel={onThumbPointerEnd}
          draggable
          onDragStart={onThumbDragStart}
          onDragEnd={onThumbDragEnd}
          onTouchStart={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
          onTouchEnd={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          aria-label="Drag thumbnail to reorder"
        >
          {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" loading="lazy" /> : <div className="thumb-placeholder" />}
        </button>

        <button type="button" className="plq-main" onClick={onPlay}>
          <div className="plq-title">{item.title}</div>
          <div className="plq-artist">{item.artist}</div>
          <div className="plq-meta">
            {formatYear(item.year)} • {formatDuration(item.durationSec)} ▶ {item.playcount}
          </div>
        </button>
        <button
          type="button"
          className="plq-remove-x"
          aria-label={`Remove ${item.title}`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onRemoveClick()
          }}
        >
          x
        </button>
      </div>
    </article>
  )
}

export default function Playlists() {
  const { queue, openPlayer, replaceQueue, reorderQueue, removeFromQueue, clearQueue } = usePlaylistContext()

  const [queueDrag, setQueueDrag] = useState<QueueDragState | null>(null)
  const [desktopDragId, setDesktopDragId] = useState<string | null>(null)
  const [desktopDropIndex, setDesktopDropIndex] = useState<number | null>(null)
  const [dragSwipeOffset, setDragSwipeOffset] = useState<{ id: string; offset: number } | null>(null)
  const [exportOpen, setExportOpen] = useState(false)

  const touchRef = useRef<QueueTouchState>({
    rowId: null,
    startX: 0,
    startY: 0,
    baseOffset: 0,
    lock: 'undecided',
    leftDistance: 0,
  })

  const queueDuration = useMemo(
    () => queue.reduce((sum, row) => sum + (typeof row.durationSec === 'number' ? row.durationSec : 0), 0),
    [queue],
  )

  const queueSummary = `${queue.length} tracks • ${formatHhMmSs(queueDuration)}`

  const shuffleQueue = () => {
    if (queue.length < 2) return
    const shuffled = [...queue]
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    replaceQueue(shuffled)
  }

  const playQueue = () => {
    if (queue.length === 0) return
    openPlayer(queue[0], { preferQueue: true })
  }

  const onQueueThumbPointerDown = (itemId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const originIndex = queue.findIndex((item) => item.id === itemId)
    if (originIndex === -1) return
    setQueueDrag({ itemId, pointerId: event.pointerId, originIndex, targetIndex: originIndex, startY: event.clientY, currentY: event.clientY })
  }

  const deriveQueueTargetIndex = (clientY: number): number | null => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('.plq-row-shell[data-queue-id]'))
    if (elements.length === 0) return null

    for (let i = 0; i < elements.length; i += 1) {
      const rect = elements[i].getBoundingClientRect()
      const midpoint = rect.top + rect.height / 2
      if (clientY < midpoint) return i
    }

    return elements.length - 1
  }

  const onQueueTouchStart = (event: ReactTouchEvent<HTMLElement>, row: VideoRecord) => {
    if (queueDrag) return
    if (event.touches.length !== 1) return
    const touch = event.touches[0]
    touchRef.current = {
      rowId: row.id,
      startX: touch.clientX,
      startY: touch.clientY,
      baseOffset: 0,
      lock: 'undecided',
      leftDistance: 0,
    }
  }

  const onQueueTouchMove = (event: ReactTouchEvent<HTMLElement>) => {
    if (queueDrag) return
    if (!touchRef.current.rowId || event.touches.length !== 1) return
    const touch = event.touches[0]
    const dx = touch.clientX - touchRef.current.startX
    const dy = touch.clientY - touchRef.current.startY
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    if (touchRef.current.lock === 'undecided' && (absDx > SWIPE_LOCK_THRESHOLD || absDy > SWIPE_LOCK_THRESHOLD)) {
      const horizontal = dx < 0 && absDx > absDy * 1.4
      touchRef.current.lock = horizontal ? 'horizontal' : 'vertical'
    }

    if (touchRef.current.lock !== 'horizontal') return

    const nextOffset = Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, touchRef.current.baseOffset + dx))
    touchRef.current.leftDistance = Math.max(0, -nextOffset)
    setDragSwipeOffset({ id: touchRef.current.rowId, offset: nextOffset })
    event.preventDefault()
  }

  const onQueueTouchEnd = () => {
    if (queueDrag) return
    if (!touchRef.current.rowId) return

    const id = touchRef.current.rowId
    if (touchRef.current.lock === 'horizontal' && touchRef.current.leftDistance >= SWIPE_REVEAL_THRESHOLD) {
      setDragSwipeOffset({ id, offset: -SWIPE_ACTION_WIDTH })
      window.setTimeout(() => {
        removeFromQueue(id)
        setDragSwipeOffset((prev) => (prev?.id === id ? null : prev))
      }, 120)
    } else {
      setDragSwipeOffset(null)
    }

    touchRef.current = {
      rowId: null,
      startX: 0,
      startY: 0,
      baseOffset: 0,
      lock: 'undecided',
      leftDistance: 0,
    }
  }

  const onDragMove = (event: ReactPointerEvent<Element>) => {
    if (queueDrag && queueDrag.pointerId === event.pointerId) {
      const nextTarget = deriveQueueTargetIndex(event.clientY)
      if (nextTarget === null) return
      setQueueDrag({ ...queueDrag, targetIndex: nextTarget, currentY: event.clientY })
      return
    }
  }

  const onDragEnd = (event: ReactPointerEvent<Element>) => {
    if (queueDrag && queueDrag.pointerId === event.pointerId) {
      if (queueDrag.targetIndex !== queueDrag.originIndex) {
        reorderQueue(queueDrag.originIndex, queueDrag.targetIndex)
      }
      setQueueDrag(null)
    }
  }

  const onQueueThumbDragStart = (itemId: string, event: React.DragEvent<HTMLButtonElement>) => {
    setDesktopDragId(itemId)
    setDesktopDropIndex(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', itemId)
  }

  const onQueueThumbDragEnd = () => {
    setDesktopDragId(null)
    setDesktopDropIndex(null)
  }

  const onQueueRowDragOver = (index: number, event: React.DragEvent<HTMLElement>) => {
    if (!desktopDragId) return
    event.preventDefault()
    if (desktopDropIndex !== index) setDesktopDropIndex(index)
  }

  const onQueueRowDrop = (index: number, event: React.DragEvent<HTMLElement>) => {
    if (!desktopDragId) return
    event.preventDefault()
    const fromIndex = queue.findIndex((item) => item.id === desktopDragId)
    if (fromIndex !== -1 && fromIndex !== index) reorderQueue(fromIndex, index)
    setDesktopDragId(null)
    setDesktopDropIndex(null)
  }

  return (
    <section className="stack" onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
      <div className="pl-control-bar">
        <button type="button" className="pl-bar-btn is-primary" onClick={playQueue} disabled={queue.length === 0}>
          Play
        </button>
        <button type="button" className="pl-bar-btn" onClick={shuffleQueue} disabled={queue.length < 2}>
          Shuffle
        </button>
        <button type="button" className="pl-bar-btn" onClick={() => setExportOpen(true)} disabled={queue.length === 0}>
          Export
        </button>
        <button type="button" className="pl-bar-btn" onClick={clearQueue} disabled={queue.length === 0}>
          Clear
        </button>
      </div>

      <div className="pl-queue-summary">{queueSummary}</div>

      {queue.length === 0 && <p className="muted">Queue is empty.</p>}

      <div className="pl-queue-list">
        {queue.map((item, index) => (
          <QueueRow
            key={item.id}
            item={item}
            dragOffset={dragSwipeOffset?.id === item.id ? dragSwipeOffset.offset : null}
            isDragging={queueDrag?.itemId === item.id}
            isDropTarget={Boolean(
              (queueDrag && queueDrag.itemId !== item.id && queueDrag.targetIndex === index) ||
                (desktopDragId && desktopDragId !== item.id && desktopDropIndex === index),
            )}
            dragLiftY={queueDrag?.itemId === item.id ? queueDrag.currentY - queueDrag.startY : 0}
            onPlay={() => openPlayer(item, { preferQueue: true })}
            onThumbPointerDown={(event) => onQueueThumbPointerDown(item.id, event)}
            onThumbPointerMove={onDragMove}
            onThumbPointerEnd={onDragEnd}
            onThumbDragStart={(event) => onQueueThumbDragStart(item.id, event)}
            onThumbDragEnd={onQueueThumbDragEnd}
            onRowDragOver={(event) => onQueueRowDragOver(index, event)}
            onRowDrop={(event) => onQueueRowDrop(index, event)}
            onTouchStart={onQueueTouchStart}
            onTouchMove={onQueueTouchMove}
            onTouchEnd={onQueueTouchEnd}
            onRemoveClick={() => removeFromQueue(item.id)}
          />
        ))}
      </div>

      {exportOpen && (
        <div className="pl-sheet-scrim" onClick={() => setExportOpen(false)}>
          <div className="pl-sheet" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => { exportQueue(queue, 'm3u'); setExportOpen(false) }}>
              Export M3U
            </button>
            <button type="button" onClick={() => { exportQueue(queue, 'csv'); setExportOpen(false) }}>
              Export CSV
            </button>
            <button type="button" onClick={() => setExportOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
