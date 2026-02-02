/**
 * Duration normalization and formatting utilities
 * All durations are normalized to seconds for calculation
 * Format back to HH:MM for display
 */

/**
 * Parse duration string (MM:SS or HH:MM:SS) to seconds
 */
export function parseDuration(duration: string): number {
  const parts = duration.split(':').map(Number)
  
  if (parts.length === 2) {
    // MM:SS format
    const [minutes, seconds] = parts
    return (minutes || 0) * 60 + (seconds || 0)
  } else if (parts.length === 3) {
    // HH:MM:SS format
    const [hours, minutes, seconds] = parts
    return (hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0)
  }
  
  return 0
}

/**
 * Format seconds to HH:MM string
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}
