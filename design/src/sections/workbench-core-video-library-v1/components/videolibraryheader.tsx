import { useState } from 'react'
import { Link } from 'react-router-dom'
import { RandomPanel } from './randompanel'
import type { VideoFile } from '../types'

type SortOption = 'title' | 'artist' | 'year' | 'count'

interface VideoLibraryHeaderProps {
  visibleCount: number
  totalCount: number
  searchQuery: string
  onSearchChange: (query: string) => void
  centerYear: number
  onCenterYearChange: (year: number) => void
  minYear: number
  maxYear: number
  sortBy: SortOption
  onSortChange: (sort: SortOption) => void
  playlistCount?: number
  playlistDuration?: number // seconds
  onPlaylistClick?: () => void
  filteredTracks: VideoFile[]
  allTracks: VideoFile[] // Full database for Catalog mode
  onAddToPlaylist?: (tracks: VideoFile[]) => void
  onPreview?: (tracks: VideoFile[]) => void
  onClearFilters?: () => void // For Catalog mode
  onRandomPanelOpenChange?: (isOpen: boolean) => void // Clear preview on reopen
  recentlyAddedFilter?: 'all' | 30 | 90 | 180 | 365
  onRecentlyAddedFilterClick?: () => void
}

/**
 * Video Library Header — v1 (Locked)
 * 
 * Layout (Top → Bottom):
 * 1. Utility Row: Search icon (left) | Search input (center, full width) | Count text (right)
 * 2. Filter Row: 7-year range selector (slider + range display)
 * 3. Sort Row: A–Z (default), Popularity, Year
 */
export function VideoLibraryHeader({
  visibleCount,
  totalCount: _totalCount,
  searchQuery,
  onSearchChange,
  centerYear,
  onCenterYearChange,
  minYear,
  maxYear,
  sortBy,
  onSortChange,
  playlistCount,
  playlistDuration,
  onPlaylistClick,
  filteredTracks,
  allTracks,
  onAddToPlaylist,
  onPreview,
  onClearFilters,
  onRandomPanelOpenChange,
  recentlyAddedFilter = 'all',
  onRecentlyAddedFilterClick,
}: VideoLibraryHeaderProps) {
  // Check if slider is at Catalog mode (fully left = minYear)
  const isCatalogMode = centerYear === minYear
  
  // Compute 7-year range: centerYear ±3 (only if not Catalog mode)
  const rangeStart = isCatalogMode ? null : Math.max(minYear, centerYear - 3)
  const rangeEnd = isCatalogMode ? null : Math.min(maxYear, centerYear + 3)
  const rangeText = isCatalogMode ? 'Catalog' : `${rangeStart}–${rangeEnd}`

  // Sort mode cycling (internal state)
  const handleSortClick = () => {
    const nextSort: SortOption = 
      sortBy === 'title' ? 'artist' : 
      sortBy === 'artist' ? 'year' : 
      sortBy === 'year' ? 'count' : 
      'title'
    onSortChange(nextSort)
  }

  const getSortLabel = () => {
    switch (sortBy) {
      case 'title': return 'Title'
      case 'artist': return 'Artist'
      case 'year': return 'Year'
      case 'count': return 'Count'
    }
  }

  // Random panel state
  const [isRandomPanelOpen, setIsRandomPanelOpen] = useState(false)

  // Playlist display formatting (fixed width, monospace: "020 – 01:34")
  const formatPlaylist = () => {
    const count = Math.max(0, Math.min(999, playlistCount ?? 0))
    const durationSeconds = playlistDuration ?? 0
    const hours = Math.floor(durationSeconds / 3600)
    const minutes = Math.floor((durationSeconds % 3600) / 60)
    const countStr = count.toString().padStart(3, '0')
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    return `${countStr} – ${timeStr}` // Use en dash (not hyphen)
  }

  return (
    <div className="sticky top-0 z-10 border-b min-w-0" style={{ background: 'var(--rv-color-navy)', borderColor: 'var(--rv-color-navy)' }}>
      {/* 1. Utility Row — Hub link, global icon, search input, count text */}
      <div className="flex items-center px-3 sm:px-6 py-2 sm:py-4 border-b min-w-0 gap-2" style={{ borderColor: 'var(--rv-color-navy)' }}>
        <Link
          to="/hub"
          className="shrink-0 text-xs sm:text-sm font-medium hover:opacity-90 transition-opacity"
          style={{ color: 'var(--rv-color-gold)' }}
        >
          ← RetroVerse Hub
        </Link>
        {/* Global icon container */}
        <div className="w-9 h-9 shrink-0 rounded flex items-center justify-center" style={{ background: 'var(--rv-color-navy)', border: '1px solid var(--rv-color-gold)' }}>
          {/* Placeholder icon */}
          <div className="w-5 h-5 opacity-60" style={{ color: 'var(--rv-color-butter)' }}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-full h-full"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
              />
            </svg>
          </div>
        </div>

        {/* Search input container (centered) */}
        <div className="flex-1 flex justify-center px-2 sm:px-4">
           <input
             type="text"
             value={searchQuery}
             onChange={(e) => onSearchChange(e.target.value)}
             placeholder="Look up . . . "
             className="w-full max-w-[120px] sm:max-w-[240px] px-3 sm:px-4 py-2 rounded focus:outline-none focus:ring-2 focus:ring-[var(--rv-color-gold)]/20 focus:border-[var(--rv-color-gold)] bg-[var(--rv-color-navy)] border border-[var(--rv-color-gold)] text-[var(--rv-color-butter)] placeholder:text-[var(--rv-color-gold)]/80"
           />
        </div>

        {/* Visible count text */}
        <div className="text-[20px] sm:text-[28px] opacity-75 sm:opacity-100 whitespace-nowrap shrink-0" style={{ color: 'var(--rv-color-butter)' }}>
          {visibleCount}
        </div>
      </div>

          {/* 2. Filter Row — 7-year range selector */}
          <div className="px-4 sm:px-6 py-1.5 sm:py-3 border-b-0 sm:border-b" style={{ borderColor: 'var(--rv-color-gold)' }}>
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Year slider */}
              <input
                type="range"
                min={minYear}
                max={maxYear}
                value={centerYear}
                onChange={(e) => onCenterYearChange(Number(e.target.value))}
                className={`flex-1 h-1.5 rounded-lg appearance-none cursor-pointer slider ${isCatalogMode ? 'opacity-50' : ''}`}
                style={{ background: 'var(--rv-color-navy)' }}
              />

              {/* Range display */}
              <div className={`text-sm font-mono shrink-0 min-w-[75px] sm:min-w-[80px] ${isCatalogMode ? 'opacity-50' : ''}`} style={{ color: 'var(--rv-color-butter)' }}>
                {rangeText}
              </div>
            </div>
          </div>

      {/* 3. Control Row — Sort, Random, Playlist */}
      <div className="px-4 sm:px-6 py-1.5 sm:py-3">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {/* Sort Control (left) */}
          <button
            onClick={handleSortClick}
            className="px-3 py-1.5 rounded-full text-sm transition-colors border hover:opacity-90"
            style={{ background: 'var(--rv-color-navy)', color: 'var(--rv-color-butter)', borderColor: 'var(--rv-color-gold)' }}
          >
            {getSortLabel()}
          </button>

          {/* Recently Added Toggle — v1 (LOCKED: 5-state, no config) */}
          {onRecentlyAddedFilterClick && (
            <button
              onClick={onRecentlyAddedFilterClick}
              className="px-3 py-1.5 rounded-full text-sm transition-colors border hover:opacity-90"
              style={
                recentlyAddedFilter !== 'all'
                  ? { background: 'var(--rv-color-coral)', color: 'var(--rv-color-butter)', borderColor: 'var(--rv-color-coral)' }
                  : { background: 'var(--rv-color-navy)', color: 'var(--rv-color-butter)', borderColor: 'var(--rv-color-gold)' }
              }
            >
              {recentlyAddedFilter === 'all' ? 'All' : 
               recentlyAddedFilter === 30 ? '30d' : 
               recentlyAddedFilter === 90 ? '90d' :
               recentlyAddedFilter === 180 ? '180d' :
               '365d'}
            </button>
          )}

          {/* Random Control (center) */}
          <button
            onClick={() => {
              setIsRandomPanelOpen(true)
              onRandomPanelOpenChange?.(true)
            }}
            className="px-3 py-1.5 rounded-full text-sm transition-colors border hover:opacity-90"
            style={
              isRandomPanelOpen
                ? { background: 'var(--rv-color-coral)', color: 'var(--rv-color-butter)', borderColor: 'var(--rv-color-coral)' }
                : { background: 'var(--rv-color-navy)', color: 'var(--rv-color-butter)', borderColor: 'var(--rv-color-gold)' }
            }
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-4 h-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3-3"
              />
            </svg>
          </button>

          {/* Playlist Display (right) */}
          <button 
            onClick={() => onPlaylistClick?.()}
            className="px-3 py-1.5 rounded-full text-sm font-mono border whitespace-nowrap transition-colors cursor-pointer hover:opacity-90"
            style={{ background: 'var(--rv-color-navy)', color: 'var(--rv-color-butter)', borderColor: 'var(--rv-color-gold)' }}
          >
            {formatPlaylist()}
          </button>
        </div>
      </div>

      {/* Slider styling */}
      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: ${isCatalogMode ? 'var(--rv-color-navy)' : 'var(--rv-color-gold)'};
          cursor: pointer;
          transition: background 0.2s;
        }
        .slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: ${isCatalogMode ? 'var(--rv-color-navy)' : 'var(--rv-color-gold)'};
          cursor: pointer;
          border: none;
          transition: background 0.2s;
        }
      `}</style>

      {/* Random Panel */}
      {onAddToPlaylist && onPreview && (
        <RandomPanel
          open={isRandomPanelOpen}
          onClose={() => {
            setIsRandomPanelOpen(false)
            onRandomPanelOpenChange?.(false)
          }}
          filteredTracks={filteredTracks}
          allTracks={allTracks}
          onAddToPlaylist={onAddToPlaylist}
          onPreview={onPreview}
          onClearFilters={onClearFilters}
          centerYear={centerYear}
          minYear={minYear}
          maxYear={maxYear}
          searchQuery={searchQuery}
        />
      )}
    </div>
  )
}
