import type { VideoRecord } from '../lib/videoIndex'

const CURRENT_KEY = 'rv_playlist_current'
const NAMES_KEY = 'rv_playlist_names'

const keyForName = (name: string) => `rv_playlist_${name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_')}`

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

const writeJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value))
}

const upsertName = (name: string) => {
  const trimmed = name.trim()
  if (!trimmed) return
  const names = listSavedPlaylists()
  if (!names.includes(trimmed)) {
    writeJson(NAMES_KEY, [...names, trimmed].sort((a, b) => a.localeCompare(b)))
  }
}

export const loadCurrentPlaylist = (): VideoRecord[] => readJson<VideoRecord[]>(CURRENT_KEY, [])

export const saveCurrentPlaylist = (list: VideoRecord[]) => {
  writeJson(CURRENT_KEY, list)
}

export const savePlaylistAs = (name: string, list: VideoRecord[]) => {
  const trimmed = name.trim()
  if (!trimmed) return
  writeJson(keyForName(trimmed), list)
  upsertName(trimmed)
}

export const loadPlaylistByName = (name: string): VideoRecord[] => {
  const trimmed = name.trim()
  if (!trimmed) return []
  return readJson<VideoRecord[]>(keyForName(trimmed), [])
}

export const listSavedPlaylists = (): string[] => readJson<string[]>(NAMES_KEY, [])

export const deletePlaylist = (name: string) => {
  const trimmed = name.trim()
  if (!trimmed) return
  localStorage.removeItem(keyForName(trimmed))
  const names = listSavedPlaylists().filter((entry) => entry !== trimmed)
  writeJson(NAMES_KEY, names)
}
