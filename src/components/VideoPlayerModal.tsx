import { useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react'
import type { VideoRecord } from '../lib/videoIndex'
import './VideoPlayerModal.css'

const PLAYER_SWIPE_CLOSE_THRESHOLD = 110
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

type Props = {
  video: VideoRecord | null
  onClose: () => void
  onEnded: () => void
}

export default function VideoPlayerModal({ video, onClose, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [dragY, setDragY] = useState(0)
  const touchRef = useRef({ active: false, startY: 0 })

  useEffect(() => {
    if (!video?.videoUrl) return
    const el = videoRef.current
    if (!el) return

    el.pause()
    el.muted = false
    el.src = video.videoUrl
    if (video.thumbnailUrl) {
      el.poster = video.thumbnailUrl
    } else {
      el.removeAttribute('poster')
    }
    el.currentTime = 0
    el.play().catch(() => {
      // Playback can be blocked on some browsers until user interaction.
    })

    return () => {
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
  }, [video])

  useEffect(() => {
    if (!video) return

    const scrollY = window.scrollY
    const original = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    }

    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.position = original.position
      document.body.style.top = original.top
      document.body.style.left = original.left
      document.body.style.right = original.right
      document.body.style.width = original.width
      document.body.style.overflow = original.overflow
      window.scrollTo(0, scrollY)
    }
  }, [video, onClose])

  const onTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
    if (event.touches.length !== 1) return
    touchRef.current.active = true
    touchRef.current.startY = event.touches[0].clientY
  }

  const onTouchMove = (event: ReactTouchEvent<HTMLElement>) => {
    if (!touchRef.current.active || event.touches.length !== 1) return
    const dy = event.touches[0].clientY - touchRef.current.startY
    if (dy <= 0) {
      setDragY(0)
      return
    }
    setDragY(clamp(dy, 0, 220))
    event.preventDefault()
  }

  const onTouchEnd = () => {
    touchRef.current.active = false
    if (dragY > PLAYER_SWIPE_CLOSE_THRESHOLD) {
      onClose()
      return
    }
    setDragY(0)
  }

  if (!video?.videoUrl) return null

  return (
    <div className="player-modal" role="dialog" aria-modal="true" aria-label="Video player" onClick={onClose}>
      <div
        className="player-modal-sheet"
        onClick={(event) => event.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <header className="player-modal-header">
          <div className="player-modal-title">
            {video.artist} - {video.title}
          </div>
          <button type="button" className="player-modal-close" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="player-modal-video-wrap">
          <video
            ref={videoRef}
            poster={video.thumbnailUrl}
            controls
            playsInline
            preload="auto"
            className="player-modal-video"
            onEnded={onEnded}
          />
        </div>
      </div>
    </div>
  )
}
