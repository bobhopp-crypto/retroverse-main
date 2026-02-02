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
}

export interface VideoLibrary {
  videos: VideoFile[]
}
