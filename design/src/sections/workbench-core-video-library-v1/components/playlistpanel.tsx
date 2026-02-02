import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { PlaylistShell } from './playlistshell'
import type { VideoFile } from '../types'

interface PlaylistPanelProps {
  open: boolean
  onClose: () => void
  playlistTracks: VideoFile[]
  onVideoClick?: (video: VideoFile) => void
  onPlay?: (video: VideoFile) => void
  onRemove?: (video: VideoFile) => void
  onExport?: () => void
  onClear?: () => void
  onReorder?: (fromIndex: number, toIndex: number) => void
}

/**
 * Playlist Panel — Overlay Mode (LOCKED)
 * 
 * Rules:
 * - Library remains mounted underneath
 * - Playlist panel covers ~90–95% viewport height
 * - Dismissible via close button or swipe-down
 * - Independent scrolling
 * - Opening playlist must NOT replace the Video Library list
 */
export function PlaylistPanel({
  open,
  onClose,
  playlistTracks,
  onVideoClick,
  onPlay,
  onRemove,
  onExport,
  onClear,
  onReorder,
}: PlaylistPanelProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="p-0 max-w-6xl w-full max-h-[95vh] h-[95vh] flex flex-col overflow-hidden"
        style={{ background: 'var(--rv-bg-panel)', borderColor: 'var(--rv-border)', color: 'var(--rv-text)' }}
        showCloseButton={false}
      >
        {/* Header with Export button */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b shrink-0" style={{ borderColor: 'var(--rv-border)' }}>
          <h2 className="text-[10px] font-semibold" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--rv-text)' }}>
            Playlist
          </h2>
          <div className="flex items-center gap-2">
            {onClear && playlistTracks.length > 0 && (
              <button
                onClick={onClear}
                className="px-3 py-1.5 rounded-full text-sm transition-colors border hover:bg-[var(--rv-border)]"
                style={{ background: 'var(--rv-bg-hover)', color: 'var(--rv-text-muted)', borderColor: 'var(--rv-border)' }}
              >
                Clear
              </button>
            )}
            {onExport && playlistTracks.length > 0 && (
              <button
                onClick={onExport}
                className="px-3 py-1.5 rounded-full text-sm transition-colors border hover:bg-[var(--rv-border)]"
                style={{ background: 'var(--rv-bg-hover)', color: 'var(--rv-text-muted)', borderColor: 'var(--rv-border)' }}
              >
                Export
              </button>
            )}
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--rv-bg-hover)] hover:text-[var(--rv-text)]"
              style={{ color: 'var(--rv-text-muted)' }}
              aria-label="Close"
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

        <div className="flex-1 overflow-y-auto hide-scrollbar">
          <PlaylistShell
            playlistTracks={playlistTracks}
            onVideoClick={onVideoClick}
            onPlay={onPlay}
            onRemove={onRemove}
            onReorder={onReorder}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
