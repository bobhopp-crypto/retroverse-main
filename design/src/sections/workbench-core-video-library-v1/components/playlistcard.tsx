import { useState, useRef } from 'react'
import type { VideoFile } from '../types'

interface PlaylistCardProps {
  video: VideoFile
  index: number
  onPlay: () => void
  onRemove: () => void
  onReorder?: (fromIndex: number, toIndex: number) => void
}

/**
 * Playlist Card — Compact Variant (LOCKED)
 * 
 * Differences from VideoRow:
 * - No thumbnail
 * - No genre
 * - No play count
 * - No info button
 * - No add (+) button
 * 
 * Controls (same location as library card):
 * - Play (▶)
 * - Remove (✕)
 * 
 * Layout:
 * - Reduced vertical padding
 * - Tighter spacing
 * - Typography unchanged
 */
export function PlaylistCard({ video, index, onPlay, onRemove, onReorder }: PlaylistCardProps) {
  // Format time: remove leading zeros from minutes (e.g., "03:45" -> "3:45")
  const formatTime = (time: string) => {
    if (!time) return ''
    const parts = time.split(':')
    if (parts.length === 2) {
      const minutes = parts[0].replace(/^0+/, '') || '0'
      return `${minutes}:${parts[1]}`
    }
    return time
  }

  const [isDragging, setIsDragging] = useState(false)
  const [dragOffsetY, setDragOffsetY] = useState(0)
  const dragStartYRef = useRef<number>(0)
  const cardRef = useRef<HTMLDivElement>(null)

  const handlePointerDown = (e: React.PointerEvent) => {
    // Prevent if clicking buttons
    if (e.target instanceof HTMLElement && e.target.closest('button')) {
      return
    }
    
    setIsDragging(true)
    dragStartYRef.current = e.clientY
    setDragOffsetY(0)
    if (cardRef.current) {
      cardRef.current.setPointerCapture(e.pointerId)
    }
    e.preventDefault()
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return
    
    const offsetY = e.clientY - dragStartYRef.current
    setDragOffsetY(offsetY)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging || !onReorder) return
    
    const offsetY = e.clientY - dragStartYRef.current
    
    // Calculate target index based on offset (estimate: ~60px per item)
    const itemHeight = 60
    const indexDelta = Math.round(offsetY / itemHeight)
    const targetIndex = Math.max(0, index + indexDelta)
    
    if (targetIndex !== index && targetIndex >= 0) {
      onReorder(index, targetIndex)
    }
    
    setIsDragging(false)
    setDragOffsetY(0)
    if (cardRef.current) {
      cardRef.current.releasePointerCapture(e.pointerId)
    }
  }

  const handlePointerCancel = (e: React.PointerEvent) => {
    setIsDragging(false)
    setDragOffsetY(0)
    if (cardRef.current) {
      cardRef.current.releasePointerCapture(e.pointerId)
    }
  }

  return (
    <div
      ref={cardRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      className={`relative w-full p-2 sm:p-3 border-b transition-colors ${
        isDragging 
          ? 'shadow-lg scale-[1.02] cursor-grabbing' 
          : 'bg-transparent cursor-grab hover:bg-[var(--rv-bg-hover)]'
      }`}
      style={{
        touchAction: 'none',
        transform: isDragging ? `translateY(${dragOffsetY}px)` : undefined,
        borderColor: 'var(--rv-border)',
        ...(isDragging ? { background: 'var(--rv-bg-drag)' } : {}),
      }}
    >
      <div className="flex gap-3 sm:gap-4 items-center">
        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title: Max 2 lines, fixed font size and line-height (matches VideoRow) */}
          <div className="font-semibold text-sm leading-[1.3] mb-1 line-clamp-2" style={{ color: 'var(--rv-text)' }}>
            {video.Title}
          </div>

          {/* Artist: 1 line only, smaller than title (matches VideoRow) */}
          <div className="text-[10px] leading-[1.2] mb-1 truncate" style={{ color: 'var(--rv-text-muted)' }}>
            {video.Artist}
          </div>

          {/* Line 3: Metadata bar (Year, Duration only) - grid layout */}
          <div className="meta-row-playlist" style={{ color: 'var(--rv-text-muted)' }}>
            <span className="meta-year">{video.Year || 'Unknown'}</span>
            <span className="text-center">•</span>
            <span className="meta-time">{formatTime(video.Length)}</span>
          </div>
        </div>

        {/* Controls — Play and Remove buttons (compact size) */}
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Play button (▶) */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onPlay()
            }}
            className="w-7 h-7 rounded-full border transition-colors flex items-center justify-center hover:bg-[var(--rv-border)] hover:text-[var(--rv-text)]"
            style={{ background: 'var(--rv-bg-hover)', borderColor: 'var(--rv-border)', color: 'var(--rv-text-muted)' }}
            aria-label="Play"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-3.5 h-3.5 ml-0.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"
              />
            </svg>
          </button>

          {/* Remove button (✕) */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className="w-7 h-7 rounded-full border transition-colors flex items-center justify-center hover:bg-[var(--rv-border)] hover:text-[var(--rv-text)]"
            style={{ background: 'var(--rv-bg-hover)', borderColor: 'var(--rv-border)', color: 'var(--rv-text-muted)' }}
            aria-label="Remove"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-4 h-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
