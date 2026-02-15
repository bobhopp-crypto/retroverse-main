import { atom } from 'jotai'

type HistorySongStat = {
  totalPlays?: number
  trend?: string
}

type HistorySessionSong = {
  videoId?: string
  filePath?: string
  playedAt?: string
  order?: number
}

type HistorySession = {
  sessionId?: string
  date?: string
  eventType?: string
  songs?: HistorySessionSong[]
}

type HistoryData = {
  sessions?: HistorySession[]
  perSong?: Record<string, HistorySongStat>
  analytics?: {
    yearDistribution?: Record<string, number>
    decadeDistribution?: Record<string, number>
  }
}

export const analyticsDataAtom = atom<HistoryData | null>(null)
export const chartStyleAtom = atom('minimal')
