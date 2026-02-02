/**
 * TypeScript interfaces for VideoFiles.json dataset
 * These types match the actual structure exported from VirtualDJ
 */

export interface VideoFile {
  Title: string
  Artist: string
  Genre: string
  Year: number
  Decade: string
  Length: string // Format: "MM:SS"
  PlayCount: number
  Grouping: string
  FilePath: string
  SourcePath: string
  thumbnailUrl?: string // Derived during normalization
  FirstSeenUnix?: number // Unix timestamp from VirtualDJ
  DaysSinceAdded?: number // Days since first seen (calculated server-side)
}

export interface VideoLibrary {
  videos: VideoFile[]
}
