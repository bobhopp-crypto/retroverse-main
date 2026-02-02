/**
 * Video Library Walking Skeleton
 * Minimal structure and interactivity - no styling
 */

import { loadVideoFiles, type VideoFile } from './lib/video-loader'

console.log('library.ts: Script loaded')
console.log('library.ts: document.readyState =', document.readyState)

// Use VideoFile directly instead of duplicating with VideoItem
// VideoItem was removed to avoid type mismatch with VideoFile

// Playlist item interface
interface PlaylistItem {
  id: string
  path: string
  title: string
  artist: string
  durationSec?: number // Optional duration in seconds
}

// Playlist storage key
const PLAYLIST_STORAGE_KEY = 'retroverse-playlist'

// Loaded videos (will be populated async)
let videos: VideoFile[] = []
let isLoading = false
let loadError: string | null = null
let timeFilterActive = false

// State
interface FilterState {
  timeRange: { min: number; max: number }
  alphaFilter: string | null
  playcountBucketFilters: Set<string>
  searchQuery: string
}

const state: FilterState = {
  timeRange: { min: 1970, max: 2025 },
  alphaFilter: null,
  playcountBucketFilters: new Set(),
  searchQuery: "",
}

// Variable window time filtering (default ALL/0)
let WINDOW_YEARS = 0 // 0 = ALL
const UI_MIN_YEAR = 1950
const SPREAD_OPTIONS = [0, 7, 11, 21] // 0 = ALL

// Dynamic playcount bucket thresholds (computed from dataset)
let playcountThresholds: { heavy: number; med: number; light: number } | null = null

// Center year for the 7-year window (null when filter inactive)
let centerYear: number | null = null

// Alpha shortcut tracking (for 1-char search mode)
let prevAlphaBeforeShortcut: string | null = null
let isInOneCharMode: boolean = false

// Calculate actual year range from loaded videos (exclude year 0)
// Returns dataset range with min clamped to UI_MIN_YEAR
function calculateYearRange(): { min: number; max: number } {
  let calculatedMin = 1970
  let calculatedMax = 2025
  
  if (videos.length > 0) {
    const years = videos
      .map(v => v.year)
      .filter((y): y is number => y !== undefined && y > 0)
    if (years.length > 0) {
      calculatedMin = Math.min(...years)
      calculatedMax = Math.max(...years)
    }
  }
  
  return {
    min: Math.max(calculatedMin, UI_MIN_YEAR), // Clamp min to 1950
    max: calculatedMax,
  }
}

// Get UI max year (always at least UI_MIN_YEAR)
function getUIMaxYear(): number {
  const range = calculateYearRange()
  return Math.max(range.max, UI_MIN_YEAR)
}

// Map slider position (0-100%) to centerYear integer (using UI range)
function sliderPositionToCenterYear(position: number): number {
  const uiMaxYear = getUIMaxYear()
  const span = uiMaxYear - UI_MIN_YEAR
  
  // Map 0-100% to UI_MIN_YEAR..UI_MAX_YEAR, round to nearest integer
  const centerYear = Math.round(UI_MIN_YEAR + (span * (position / 100)))
  
  // Clamp to UI range
  return Math.max(UI_MIN_YEAR, Math.min(uiMaxYear, centerYear))
}

// Map centerYear to slider position percentage (0-100%) (using UI range)
function centerYearToSliderPosition(centerYear: number): number {
  const uiMaxYear = getUIMaxYear()
  const span = uiMaxYear - UI_MIN_YEAR
  
  if (span === 0) return 50
  
  const position = ((centerYear - UI_MIN_YEAR) / span) * 100
  return Math.max(0, Math.min(100, position))
}

// Calculate window from centerYear using WINDOW_YEARS (clamped to UI bounds)
// If WINDOW_YEARS === 0, return full range (ALL)
function centerYearToYearRange(centerYear: number): { min: number; max: number } {
  if (WINDOW_YEARS === 0) {
    // ALL option - return full range
    return calculateYearRange()
  }
  
  const uiMaxYear = getUIMaxYear()
  const radius = Math.floor(WINDOW_YEARS / 2)
  const start = centerYear - radius
  const end = centerYear + radius
  
  return {
    min: Math.max(UI_MIN_YEAR, start),
    max: Math.min(uiMaxYear, end)
  }
}

// Calculate button width as percentage based on WINDOW_YEARS
function getButtonWidthPercent(): number {
  const uiMaxYear = getUIMaxYear()
  const span = uiMaxYear - UI_MIN_YEAR
  if (span === 0) return 100
  
  // If ALL (WINDOW_YEARS === 0), use a fixed small width
  if (WINDOW_YEARS === 0) {
    return 15 // Fixed width for "ALL" button
  }
  
  // Button width represents WINDOW_YEARS as a percentage of total span
  const widthPercent = (WINDOW_YEARS / span) * 100
  // Clamp between min and max for usability
  return Math.max(8, Math.min(widthPercent, 95))
}

// Update button text, width, and position
function updateTimeRangeButton() {
  const btn = document.getElementById('spreadToggleBtn')
  if (!btn) return
  
  if (timeFilterActive && centerYear !== null && WINDOW_YEARS > 0) {
    const range = centerYearToYearRange(centerYear)
    // Display range on two lines without hyphen
    btn.innerHTML = `${range.min}<br>${range.max}`
    
    // Calculate button width and position
    const widthPercent = getButtonWidthPercent()
    const centerPercent = centerYearToSliderPosition(centerYear)
    
    // Position button so its center is at centerPercent
    // Left edge = centerPercent - (widthPercent / 2)
    const leftPercent = Math.max(0, Math.min(100 - widthPercent, centerPercent - (widthPercent / 2)))
    
    btn.style.width = `${widthPercent}%`
    btn.style.left = `${leftPercent}%`
    btn.style.transform = 'none'
    btn.removeAttribute('data-state')
  } else {
    // Show ALL when inactive or when WINDOW_YEARS === 0
    btn.textContent = 'ALL'
    btn.setAttribute('data-state', 'all')
    btn.style.width = 'auto'
    btn.style.left = 'auto'
    btn.style.transform = 'none'
  }
}

// DOM Elements
let popularityToggles: NodeListOf<HTMLElement> | null = null
let counterPlaceholder: HTMLElement | null = null
let randomBtn: HTMLElement | null = null
let modalOverlay: HTMLElement | null = null
let modalClose: HTMLElement | null = null
let videoList: HTMLElement | null = null

// Time Range Button/Slider state
let isDraggingButton = false
let dragStartX = 0
let dragStartCenterPercent = 0
let dragDistance = 0
const DRAG_THRESHOLD = 5 // pixels to distinguish drag from click
let activePointerId: number | null = null

function initTimeSlider() {
  const btn = document.getElementById('spreadToggleBtn')
  const container = btn?.parentElement
  if (!btn || !container) return

  const usePointerEvents = 'PointerEvent' in window

  const handlePointerDown = (e: MouseEvent | PointerEvent) => {
    const clientX = 'clientX' in e ? e.clientX : (e as MouseEvent).clientX
    
    // Start drag - always allow dragging
    isDraggingButton = true
    dragStartX = clientX
    dragDistance = 0
    
    // If filter is inactive, initialize centerYear from button position
    if (!timeFilterActive || centerYear === null) {
      const containerRect = container.getBoundingClientRect()
      const clickPercent = ((clientX - containerRect.left) / containerRect.width) * 100
      centerYear = sliderPositionToCenterYear(Math.max(0, Math.min(100, clickPercent)))
      dragStartCenterPercent = centerYearToSliderPosition(centerYear)
    } else {
      dragStartCenterPercent = centerYearToSliderPosition(centerYear)
    }
    
    if (usePointerEvents && 'pointerId' in e) {
      activePointerId = (e as PointerEvent).pointerId
      btn.setPointerCapture(activePointerId)
    }
    e.preventDefault()
  }

  const handlePointerMove = (e: MouseEvent | PointerEvent) => {
    if (!isDraggingButton) return
    
    const currentX = 'clientX' in e ? e.clientX : (e as MouseEvent).clientX
    const deltaX = currentX - dragStartX
    dragDistance += Math.abs(deltaX)
    
    const containerRect = container.getBoundingClientRect()
    const deltaPercent = (deltaX / containerRect.width) * 100
    
    const newCenterPercent = Math.max(0, Math.min(100, dragStartCenterPercent + deltaPercent))
    const newCenterYear = sliderPositionToCenterYear(newCenterPercent)
    centerYear = newCenterYear
    
    if (WINDOW_YEARS > 0) {
      state.timeRange = centerYearToYearRange(centerYear)
    } else {
      state.timeRange = calculateYearRange()
    }
    
    updateTimeRangeButton()
    updateVideoList()
    
    dragStartX = currentX
    dragStartCenterPercent = newCenterPercent
  }

  const handlePointerUp = () => {
    if (isDraggingButton) {
      isDraggingButton = false
      
      if (usePointerEvents && activePointerId !== null) {
        btn.releasePointerCapture(activePointerId)
        activePointerId = null
      }
      
      if (dragDistance >= DRAG_THRESHOLD) {
        // Was a drag
        if (WINDOW_YEARS > 0) {
          timeFilterActive = true
        } else {
          timeFilterActive = false
          state.timeRange = calculateYearRange()
        }
        renderDebugStatus()
      } else {
        // Was a click, toggle spread
        const currentIndex = SPREAD_OPTIONS.indexOf(WINDOW_YEARS)
        const nextIndex = (currentIndex + 1) % SPREAD_OPTIONS.length
        WINDOW_YEARS = SPREAD_OPTIONS[nextIndex]
        
        if (timeFilterActive && centerYear !== null && WINDOW_YEARS > 0) {
          state.timeRange = centerYearToYearRange(centerYear)
          updateVideoList()
          updateTimeRangeButton()
        } else if (WINDOW_YEARS === 0) {
          // ALL option - disable time filter
          timeFilterActive = false
          state.timeRange = calculateYearRange()
          updateVideoList()
          updateTimeRangeButton()
        } else {
          updateTimeRangeButton()
        }
        renderDebugStatus()
      }
      dragDistance = 0
    }
  }

  // Attach events
  if (usePointerEvents) {
    btn.addEventListener('pointerdown', handlePointerDown as EventListener)
    document.addEventListener('pointermove', handlePointerMove as EventListener)
    document.addEventListener('pointerup', handlePointerUp as EventListener)
    document.addEventListener('pointercancel', handlePointerUp as EventListener)
  } else {
    btn.addEventListener('mousedown', handlePointerDown as EventListener)
    document.addEventListener('mousemove', handlePointerMove as EventListener)
    document.addEventListener('mouseup', handlePointerUp as EventListener)
  }
  
  // Initialize button
  updateTimeRangeButton()
}


// Spread selector is now integrated into initTimeSlider button click handler
function initSpreadSelector() {
  // This function is no longer needed - functionality moved to initTimeSlider
  // But we still need to initialize the button display
  updateTimeRangeButton()
}

// Alpha Filter - Helper functions for 1-letter shortcut
const letters = ['#', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))]

// Helper: Check if character is A-Z
function isLetter(char: string): boolean {
  return /^[A-Za-z]$/.test(char)
}

// Playlist Helper Functions
function formatDuration(totalSec: number): string {
  const sec = Math.floor(totalSec || 0)
  const hours = Math.floor(sec / 3600)
  const minutes = Math.floor((sec % 3600) / 60)
  const minutesStr = minutes.toString().padStart(2, '0')
  return `${hours}:${minutesStr}`
}

// Format duration as M:SS (for video cards)
function formatDurationShort(seconds: number): string {
  const sec = Math.floor(seconds || 0)
  const minutes = Math.floor(sec / 60)
  const secs = sec % 60
  const secsStr = secs.toString().padStart(2, '0')
  return `${minutes}:${secsStr}`
}

/**
 * Compute playcount thresholds from current dataset using percentiles
 * Split: 25% HEAVY (top), 50% MED (middle), 25% LIGHT (bottom)
 * Only considers items with playCount >= 2
 */
function computePlaycountThresholds(): void {
  // Filter to items with playCount >= 2
  const eligibleVideos = videos.filter(v => v.playCount >= 2)
  
  if (eligibleVideos.length === 0) {
    // No eligible videos - set defaults
    playcountThresholds = { heavy: 2, med: 2, light: 2 }
    return
  }
  
  // Extract playCounts and sort in descending order
  const playCounts = eligibleVideos.map(v => v.playCount).sort((a, b) => b - a)
  const count = playCounts.length
  
  // Compute percentile indices for thresholds (sorted descending)
  // Split: 25% HEAVY, 50% MED, 25% LIGHT
  // Bucket boundaries (0-based indices):
  // - HEAVY: indices 0 to ceil(count * 0.25) - 1
  // - MED: indices ceil(count * 0.25) to ceil(count * 0.75) - 1
  // - LIGHT: indices ceil(count * 0.75) to count - 1
  
  // Thresholds: minimum playCount to be in each bucket
  // HEAVY threshold = value at first index of MED bucket (ceiling ensures we get >= 25%)
  const heavyThresholdIdx = Math.min(count - 1, Math.ceil(count * 0.25))
  // MED threshold = value at first index of LIGHT bucket
  const medThresholdIdx = Math.min(count - 1, Math.ceil(count * 0.75))
  
  // Get threshold values (array is sorted descending)
  const heavyThreshold = playCounts[heavyThresholdIdx] || 2
  const medThreshold = playCounts[medThresholdIdx] || 2
  
  // Ensure thresholds are valid (heavy >= med >= 2)
  playcountThresholds = {
    heavy: Math.max(heavyThreshold, medThreshold, 2),
    med: Math.max(medThreshold, 2),
    light: 2
  }
}

/**
 * Classify all videos into playcount buckets based on computed thresholds
 */
function classifyAllVideos(): void {
  if (!playcountThresholds) {
    return
  }
  
  videos.forEach(video => {
    video.playcountBucket = classifyPlaycount(video.playCount)
  })
}

/**
 * Classify a single video's playCount into a bucket
 */
function classifyPlaycount(playCount: number): 'heavy' | 'med' | 'light' | 'none' | undefined {
  // NONE is absolute: playCount <= 1
  if (playCount <= 1) {
    return 'none'
  }
  
  // If thresholds not computed, return undefined
  if (!playcountThresholds) {
    return undefined
  }
  
  // Classify based on thresholds
  if (playCount >= playcountThresholds.heavy) {
    return 'heavy'
  }
  if (playCount >= playcountThresholds.med) {
    return 'med'
  }
  // playCount >= 2 but < med threshold
  return 'light'
}

function getPlaylist(): PlaylistItem[] {
  try {
    const stored = localStorage.getItem(PLAYLIST_STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored) as PlaylistItem[]
  } catch {
    return []
  }
}

function computePlaylistTotals(items: PlaylistItem[]): { count: number; totalSec: number } {
  const count = items.length
  const totalSec = items.reduce((sum, item) => {
    const dur = item.durationSec
    return sum + (typeof dur === 'number' && !isNaN(dur) ? dur : 0)
  }, 0)
  return { count, totalSec }
}

function updatePlaylistButton() {
  const btn = document.getElementById('playlistBtn')
  if (!btn) return
  
  const items = getPlaylist()
  const { count, totalSec } = computePlaylistTotals(items)
  btn.textContent = `${count} - ${formatDuration(totalSec)}`
  
  // Toggle hasItems class
  if (count > 0) {
    btn.classList.add('hasItems')
  } else {
    btn.classList.remove('hasItems')
  }
}

function updateTimeYearDisplay() {
  updateTimeRangeButton()
}

// Update alpha chip display
function updateAlphaChip() {
  const chip = document.getElementById('alphaChip')
  if (!chip) return
  
  const query = state.searchQuery
  if (query.length === 1 && isLetter(query)) {
    chip.textContent = query.toUpperCase()
    chip.classList.remove('hidden')
  } else {
    chip.classList.add('hidden')
  }
}

// Initialize alpha chip click handler
function initAlphaChip() {
  const chip = document.getElementById('alphaChip')
  if (!chip) return
  
  chip.addEventListener('click', () => {
    // Clear search
    const searchInput = document.getElementById('searchInput') as HTMLInputElement
    if (searchInput) {
      searchInput.value = ""
    }
    
    // Exit 1-char mode if active
    if (isInOneCharMode) {
      state.alphaFilter = prevAlphaBeforeShortcut
      prevAlphaBeforeShortcut = null
      isInOneCharMode = false
    }
    
    state.searchQuery = ""
    updateAlphaChip()
    updateVideoList()
  })
}

// Search Input
function initSearchInput() {
  const searchInput = document.getElementById('searchInput') as HTMLInputElement
  if (!searchInput) return
  
  searchInput.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement
    const value = target.value.trim()
    const len = value.length
    
    if (len === 1 && isLetter(value)) {
      // Case a: Single letter - act as alpha shortcut
      if (!isInOneCharMode) {
        prevAlphaBeforeShortcut = state.alphaFilter
        isInOneCharMode = true
      }
      const letter = value.toLowerCase()
      state.alphaFilter = letter
      state.searchQuery = "" // Clear search, use alpha filter instead
      updateAlphaChip()
      updateVideoList()
    } else if (len >= 1) {
      // Case b: 1+ characters (including non-letter single chars) - normal search
      if (isInOneCharMode) {
        state.alphaFilter = prevAlphaBeforeShortcut
        prevAlphaBeforeShortcut = null
        isInOneCharMode = false
      }
      state.searchQuery = value
      updateAlphaChip()
      updateVideoList()
    } else {
      // Case c: Empty - restore and clear
      if (isInOneCharMode) {
        state.alphaFilter = prevAlphaBeforeShortcut
        prevAlphaBeforeShortcut = null
        isInOneCharMode = false
      }
      state.searchQuery = ""
      updateAlphaChip()
      updateVideoList()
    }
  })
}

// Playcount Bucket Toggles
function initPopularityToggles() {
  popularityToggles = document.querySelectorAll('.popularity-toggle')
  counterPlaceholder = document.getElementById('counterPlaceholder')
  randomBtn = document.getElementById('randomBtn')

  if (!popularityToggles.length || !counterPlaceholder || !randomBtn) return

  popularityToggles.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const bucket = toggle.dataset.playcountBucket
      if (!bucket) return

      // Convert HTML attribute to internal bucket value
      const internalValue = bucket as 'heavy' | 'med' | 'light' | 'none'

      if (state.playcountBucketFilters.has(internalValue)) {
        state.playcountBucketFilters.delete(internalValue)
        toggle.classList.remove('active')
      } else {
        state.playcountBucketFilters.add(internalValue)
        toggle.classList.add('active')
      }

      updateVideoList()
      renderDebugStatus()
    })
  })
}

// Random Modal
function initModal() {
  modalOverlay = document.getElementById('modalOverlay')
  modalClose = document.getElementById('modalClose')

  if (!modalOverlay || !modalClose) return

  modalClose.addEventListener('click', () => {
    closeModal()
  })

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      closeModal()
    }
  })
}

function openModal() {
  if (modalOverlay) {
    modalOverlay.classList.add('show')
  }
}

function closeModal() {
  if (modalOverlay) {
    modalOverlay.classList.remove('show')
  }
}

// Video List
function filterVideos(): VideoFile[] {
  return videos.filter((video) => {
    // Alpha filter
    if (state.alphaFilter) {
      const artist = video.artist || '(Unknown Artist)'
      // Treat "(Unknown Artist)" as "#" (non-alphabetic)
      if (artist === '(Unknown Artist)') {
        if (state.alphaFilter !== '#') {
          return false
        }
      } else {
        const firstChar = artist.charAt(0).toLowerCase()
        if (firstChar !== state.alphaFilter) {
          return false
        }
      }
    }

    // Playcount bucket filters
    if (state.playcountBucketFilters.size > 0) {
      if (!video.playcountBucket || !state.playcountBucketFilters.has(video.playcountBucket)) {
        return false
      }
    }

    // Time range filter - only apply when user has interacted with slider
    // Include items with year === 0 (unknown year) in all ranges
    if (timeFilterActive && video.year > 0) {
      if (video.year < state.timeRange.min || video.year > state.timeRange.max) {
        return false
      }
    }
    // Items with year === 0 are always included (unknown years)

    // Search filter
    if (state.searchQuery) {
      const searchLower = state.searchQuery.toLowerCase()
      const searchText = `${video.title} ${video.artist}`.toLowerCase()
      if (!searchText.includes(searchLower)) {
        return false
      }
    }

    return true
  })
}

/**
 * Sort videos by artist, then by title
 * Unknown entries sort to the bottom
 */
function sortVideos(videosToSort: VideoFile[]): VideoFile[] {
  return [...videosToSort].sort((a, b) => {
    const artistA = a.artist || '(Unknown Artist)'
    const artistB = b.artist || '(Unknown Artist)'
    
    // Special handling: "(Unknown Artist)" sorts after all others
    if (artistA === '(Unknown Artist)' && artistB !== '(Unknown Artist)') {
      return 1 // a comes after b
    }
    if (artistB === '(Unknown Artist)' && artistA !== '(Unknown Artist)') {
      return -1 // b comes after a
    }
    
    // Normal comparison for non-unknown artists
    if (artistA.toLowerCase() !== artistB.toLowerCase()) {
      return artistA.toLowerCase().localeCompare(artistB.toLowerCase())
    }
    
    // Same artist - sort by title
    const titleA = a.title || '(Unknown Title)'
    const titleB = b.title || '(Unknown Title)'
    
    // Special handling: "(Unknown Title)" sorts after all others
    if (titleA === '(Unknown Title)' && titleB !== '(Unknown Title)') {
      return 1
    }
    if (titleB === '(Unknown Title)' && titleA !== '(Unknown Title)') {
      return -1
    }
    
    return titleA.toLowerCase().localeCompare(titleB.toLowerCase())
  })
}

/**
 * Render debug status showing all filter states
 */
function renderDebugStatus() {
  const debugStatus = document.getElementById('debugStatus')
  if (!debugStatus) return

  // Get filtered list for "Showing" count
  const filtered = filterVideos()
  const total = videos.length
  const showing = filtered.length

  // Alpha filter
  const alpha = state.alphaFilter || 'ALL'

  // Playcount bucket filter
  const bucketSize = state.playcountBucketFilters.size
  const buckets = bucketSize === 0 
    ? 'ALL' 
    : Array.from(state.playcountBucketFilters).sort().join(',')
  
  // Threshold display
  let thresholdDisplay = 'N/A'
  if (playcountThresholds) {
    thresholdDisplay = `Heavy>=${playcountThresholds.heavy},Med>=${playcountThresholds.med},Light>=2,None<=1`
  }

  // Time active
  const timeActive = timeFilterActive

  // UI year range (always starts at 1950)
  const uiMaxYear = getUIMaxYear()
  const range = `${UI_MIN_YEAR}..${uiMaxYear}`

  // Slider position
  const sliderLeft = timeFilterActive && centerYear !== null 
    ? `${Math.round(centerYearToSliderPosition(centerYear))}%`
    : '50%'

  // Center year
  const centerYearDisplay = timeFilterActive && centerYear !== null
    ? centerYear.toString()
    : 'none'

  // Applied years - show window when active
  let appliedYears = 'ALL'
  if (timeFilterActive && centerYear !== null && WINDOW_YEARS > 0) {
    const windowRange = centerYearToYearRange(centerYear)
    appliedYears = `${windowRange.min}..${windowRange.max}`
  }

  // Spread
  const spread = WINDOW_YEARS === 0 ? 'ALL' : WINDOW_YEARS

  // Search
  const search = state.searchQuery ? `"${state.searchQuery}"` : 'none'

  // Format status string
  const status = `Total=${total} | Showing=${showing} | Alpha=${alpha} | Buckets=${buckets} | Thresholds=${thresholdDisplay} | TimeActive=${timeActive} | Range=${range} | SliderLeft=${sliderLeft} | CenterYear=${centerYearDisplay} | Spread=${spread} | AppliedYears=${appliedYears} | Search=${search}`
  
  debugStatus.textContent = status
}

/**
 * Get thumbnail URL for a video (placeholder/stub implementation)
 * Returns a static placeholder SVG as data URL
 */
function getThumbnailUrl(path: string): string {
  // Simple placeholder SVG with video icon
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
    <rect width="80" height="80" fill="#e5e7eb"/>
    <path d="M30 25 L55 40 L30 55 Z" fill="#9ca3af"/>
  </svg>`
  const encoded = btoa(unescape(encodeURIComponent(svg)))
  return `data:image/svg+xml;base64,${encoded}`
}

function renderVideoList() {
  if (!videoList) {
    // Try to find videoList element if not set
    videoList = document.getElementById('videoList')
    if (!videoList) {
      console.error('videoList element not found')
      return
    }
  }

  // Show loading state
  if (isLoading) {
    videoList.innerHTML = '<div class="video-item">Loading videos...</div>'
    if (counterPlaceholder) {
      counterPlaceholder.textContent = 'Loading...'
    }
    return
  }

  // Show error state
  if (loadError) {
    videoList.innerHTML = `<div class="video-item" style="color: red;">Error: ${loadError}</div>`
    if (counterPlaceholder) {
      counterPlaceholder.textContent = 'Error'
    }
    return
  }

  const filtered = filterVideos()
  const sorted = sortVideos(filtered)
  
  console.log('renderVideoList: Filtered to', filtered.length, 'videos, sorted to', sorted.length, 'videos')
  
  // Update counter
  if (counterPlaceholder) {
    counterPlaceholder.textContent = `${sorted.length} items`
  }

  // Clear and rebuild list
  if (!videoList) {
    console.error('renderVideoList: videoList is null')
    return
  }
  console.log('renderVideoList: Clearing and rendering', sorted.length, 'items')
  videoList.innerHTML = ''

  if (sorted.length === 0) {
    console.log('renderVideoList: No videos to render after filtering')
    videoList.innerHTML = '<div class="video-item">No videos match the current filters</div>'
    return
  }
  
  console.log('renderVideoList: Rendering', sorted.length, 'video items')
  
  // Limit initial rendering for performance (render first 100, then rest)
  const RENDER_BATCH_SIZE = 100
  const itemsToRender = sorted.slice(0, RENDER_BATCH_SIZE)
  console.log('renderVideoList: Rendering first', itemsToRender.length, 'items initially')
  
  itemsToRender.forEach((video, index) => {
    if (index < 3) console.log('renderVideoList: Rendering video', index, video.title)
    const item = document.createElement('div')
    item.className = 'video-item'
    
    // Thumbnail (use actual URL if available, otherwise placeholder)
    const thumbnailUrl = video.thumbnailUrl || getThumbnailUrl(video.path)
    const thumbnail = document.createElement('img')
    thumbnail.className = 'video-item-thumbnail'
    thumbnail.src = thumbnailUrl
    thumbnail.alt = `${video.title || '(Unknown Title)'} thumbnail`
    item.appendChild(thumbnail)
    
    const content = document.createElement('div')
    content.className = 'video-item-content'
    
    // Line 1: Title (bold)
    const title = document.createElement('div')
    title.className = 'video-item-title'
    title.textContent = video.title || '(Unknown Title)'
    
    // Line 2: Artist + grouping
    const artist = document.createElement('div')
    artist.className = 'video-item-artist'
    let artistText = video.artist || '(Unknown Artist)'
    if (video.grouping) {
      artistText += ` (${video.grouping})`
    }
    artist.textContent = artistText
    
    // Line 3: Year | Duration on left, Play count on right
    const metadataRow = document.createElement('div')
    metadataRow.className = 'video-item-metadata'
    metadataRow.style.display = 'flex'
    metadataRow.style.justifyContent = 'space-between'
    metadataRow.style.fontSize = '0.85em'
    metadataRow.style.color = '#666'
    metadataRow.style.marginTop = '0.25rem'
    
    // Left side: Year | Duration
    const leftMeta = document.createElement('span')
    const parts: string[] = []
    if (video.year > 0) {
      parts.push(video.year.toString())
    }
    if (video.durationSec > 0) {
      parts.push(formatDurationShort(video.durationSec))
    }
    leftMeta.textContent = parts.join(' | ')
    
    // Right side: Play count
    const rightMeta = document.createElement('span')
    if (video.playCount > 0) {
      rightMeta.textContent = `${video.playCount}`
    }
    
    metadataRow.appendChild(leftMeta)
    metadataRow.appendChild(rightMeta)

    content.appendChild(title)
    content.appendChild(artist)
    if (leftMeta.textContent || rightMeta.textContent) {
      content.appendChild(metadataRow)
    }
    
    // Create videoRow wrapper
    const videoRow = document.createElement('div')
    videoRow.className = 'videoRow'
    
    // Add + button
    const addBtn = document.createElement('button')
    addBtn.className = 'addBtn'
    addBtn.textContent = '+'
    
    // Handle + button click - add to playlist
    addBtn.addEventListener('click', () => {
      const playlist = getPlaylist()
      
      // Check if already in playlist
      if (playlist.some(item => item.id === video.id)) {
        return // Already added, don't duplicate
      }
      
      // Add to playlist
      const newItem: PlaylistItem = {
        id: video.id,
        path: video.path,
        title: video.title,
        artist: video.artist,
        durationSec: video.durationSec > 0 ? video.durationSec : undefined
      }
      
      playlist.push(newItem)
      localStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(playlist))
      updatePlaylistButton()
    })
    
    videoRow.appendChild(content)
    videoRow.appendChild(addBtn)
    item.appendChild(videoRow)
    videoList!.appendChild(item)
  })
  
  // Verify items were added
  const childCount = videoList.children.length
  console.log('renderVideoList: Finished rendering. videoList now has', childCount, 'children')
  if (childCount === 0) {
    console.error('renderVideoList: WARNING - No children were added to videoList!')
    console.log('renderVideoList: videoList element:', videoList)
    console.log('renderVideoList: videoList.innerHTML length:', videoList.innerHTML.length)
    console.log('renderVideoList: videoList computed style:', window.getComputedStyle(videoList))
  } else {
    console.log('renderVideoList: Successfully rendered', childCount, 'items')
    // Render remaining items in batches if needed
    if (sorted.length > RENDER_BATCH_SIZE) {
      console.log('renderVideoList: Will render remaining', sorted.length - RENDER_BATCH_SIZE, 'items in background')
      const remaining = sorted.slice(RENDER_BATCH_SIZE)
      let batchIndex = 0
      const renderBatch = () => {
        const batch = remaining.slice(batchIndex * 50, (batchIndex + 1) * 50)
        if (batch.length === 0) {
          console.log('renderVideoList: Finished rendering all', sorted.length, 'items')
          return
        }
        batch.forEach((video) => {
          // Reuse the same item creation logic
          const item = document.createElement('div')
          item.className = 'video-item'
          const thumbnailUrl = video.thumbnailUrl || getThumbnailUrl(video.path)
          const thumbnail = document.createElement('img')
          thumbnail.className = 'video-item-thumbnail'
          thumbnail.src = thumbnailUrl
          thumbnail.alt = `${video.title || '(Unknown Title)'} thumbnail`
          item.appendChild(thumbnail)
          
          const content = document.createElement('div')
          content.className = 'video-item-content'
          const title = document.createElement('div')
          title.className = 'video-item-title'
          title.textContent = video.title || '(Unknown Title)'
          const artist = document.createElement('div')
          artist.className = 'video-item-artist'
          let artistText = video.artist || '(Unknown Artist)'
          if (video.grouping) {
            artistText += ` (${video.grouping})`
          }
          artist.textContent = artistText
          content.appendChild(title)
          content.appendChild(artist)
          
          const videoRow = document.createElement('div')
          videoRow.className = 'videoRow'
          const addBtn = document.createElement('button')
          addBtn.className = 'addBtn'
          addBtn.textContent = '+'
          addBtn.addEventListener('click', () => {
            const playlist = getPlaylist()
            if (!playlist.some(item => item.id === video.id)) {
              playlist.push({
                id: video.id,
                path: video.path,
                title: video.title,
                artist: video.artist,
                durationSec: video.durationSec > 0 ? video.durationSec : undefined
              })
              localStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(playlist))
              updatePlaylistButton()
            }
          })
          videoRow.appendChild(content)
          videoRow.appendChild(addBtn)
          item.appendChild(videoRow)
          videoList!.appendChild(item)
        })
        batchIndex++
        setTimeout(renderBatch, 10)
      }
      setTimeout(renderBatch, 100)
    }
  }
}

function updateVideoList() {
  renderVideoList()
  renderDebugStatus()
}

/**
 * Load videos from VideoFiles.json
 */
async function loadVideos(): Promise<void> {
  console.log('loadVideos: Starting...')
  isLoading = true
  loadError = null
  renderVideoList()

  try {
    console.log('loadVideos: Fetching video files...')
    const loaded = await loadVideoFiles()
    console.log('loadVideos: Received', loaded.length, 'videos')
    videos = loaded
    
    // Compute playcount thresholds from dataset
    computePlaycountThresholds()
    
    // Classify videos into playcount buckets
    classifyAllVideos()
    
    // Calculate UI year range and set centerYear to midpoint of UI range
    const uiMaxYear = getUIMaxYear()
    centerYear = Math.floor((UI_MIN_YEAR + uiMaxYear) / 2)
    
    // Update button position
    updateTimeRangeButton()
    
    // Initialize time range to full data range (show all items initially)
    // Filter remains inactive (timeFilterActive stays false)
    state.timeRange = calculateYearRange()
  } catch (error) {
    console.error('Failed to load videos:', error)
    loadError = error instanceof Error ? error.message : 'Failed to load video files'
    videos = []
  } finally {
    isLoading = false
    renderVideoList()
    renderDebugStatus()
    updatePlaylistButton() // Update playlist button after videos load
    updateTimeYearDisplay() // Update year display after videos load
  }
}

/**
 * Reset all filters to initial state
 */
function resetAllFilters() {
  // Reset alpha filter
  state.alphaFilter = null
  
  // Reset popularity filters
  state.playcountBucketFilters.clear()
  
  // Reset alpha shortcut tracking
  prevAlphaBeforeShortcut = null
  isInOneCharMode = false
  
  // Reset time filter
  timeFilterActive = false
  const uiMaxYear = getUIMaxYear()
  centerYear = Math.floor((UI_MIN_YEAR + uiMaxYear) / 2)
  state.timeRange = calculateYearRange() // Full range for inactive filter
  
  // Update button position
  updateTimeRangeButton()
  
  // Reset alpha filter
  state.alphaFilter = null
  
  // Remove active classes from popularity toggles
  if (popularityToggles) {
    popularityToggles.forEach((toggle) => {
      toggle.classList.remove('active')
    })
  }
  
  // Reset search
  state.searchQuery = ""
  const searchInput = document.getElementById('searchInput') as HTMLInputElement
  if (searchInput) {
    searchInput.value = ""
  }
  
  // Reset alpha shortcut tracking
  prevAlphaBeforeShortcut = null
  isInOneCharMode = false
  
  // Hide alpha chip
  updateAlphaChip()
  
  // Update UI
  updateVideoList()
  renderDebugStatus()
  updateTimeYearDisplay()
}

// Initialize
async function init() {
  console.log('library.ts: init() called')
  try {
    console.log('library.ts: Looking for videoList element')
    videoList = document.getElementById('videoList')
    if (!videoList) {
      console.error('Could not find videoList element')
      console.log('library.ts: Available elements:', {
        console: document.querySelector('.console'),
        videoList: document.getElementById('videoList'),
        body: document.body
      })
      return
    }
    console.log('library.ts: videoList found, initializing components...')

    initTimeSlider()
    initSpreadSelector()
    initSearchInput()
    initAlphaChip()
    initPopularityToggles()
    initModal()
    
    // Initialize playlist button (will be updated after videos load)
    updatePlaylistButton()
    
    // Wire up reset button
    const resetBtn = document.getElementById('resetFiltersBtn')
    if (resetBtn) {
      resetBtn.addEventListener('click', resetAllFilters)
    }
    
    console.log('library.ts: Starting to load videos...')
    // Load videos before rendering
    await loadVideos()
    console.log('library.ts: Videos loaded, count:', videos.length)
  } catch (error) {
    console.error('Error initializing:', error)
    if (videoList) {
      videoList.innerHTML = `<div class="video-item" style="color: red;">Initialization error: ${error instanceof Error ? error.message : String(error)}</div>`
    }
  }
}

// Start when DOM is ready
console.log('library.ts: Checking document ready state:', document.readyState)
if (document.readyState === 'loading') {
  console.log('library.ts: DOM still loading, waiting for DOMContentLoaded')
  document.addEventListener('DOMContentLoaded', () => {
    console.log('library.ts: DOMContentLoaded fired')
    init()
  })
} else {
  console.log('library.ts: DOM already ready, calling init() immediately')
  init()
}