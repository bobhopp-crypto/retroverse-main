import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { VideoRecord } from '../lib/videoIndex'

const STORAGE_QUEUE_KEY = 'retroverse.queue.v1'
const STORAGE_PLAYLISTS_KEY = 'retroverse.playlists.v1'

export type SavedPlaylist = {
  id: string
  name: string
  items: VideoRecord[]
  createdAt: string
  updatedAt: string
}

type PlayerSource =
  | { type: 'single' }
  | {
      type: 'queue'
      index: number
    }

type PlaylistContextValue = {
  queue: VideoRecord[]
  savedPlaylists: SavedPlaylist[]
  nowPlaying: VideoRecord | null
  addToQueue: (video: VideoRecord) => void
  addManyToQueue: (videos: VideoRecord[]) => void
  replaceQueue: (videos: VideoRecord[]) => void
  removeFromQueue: (id: string) => void
  clearQueue: () => void
  reorderQueue: (fromIndex: number, toIndex: number) => void
  moveQueueItemTop: (id: string) => void
  moveQueueItemBottom: (id: string) => void
  createPlaylist: (name: string) => SavedPlaylist
  renamePlaylist: (playlistId: string, name: string) => void
  deletePlaylist: (playlistId: string) => void
  addToSavedPlaylist: (playlistId: string, video: VideoRecord) => void
  removeFromSavedPlaylist: (playlistId: string, itemId: string) => void
  replaceSavedPlaylistItems: (playlistId: string, items: VideoRecord[]) => void
  reorderSavedPlaylist: (playlistId: string, fromIndex: number, toIndex: number) => void
  moveSavedPlaylistItemTop: (playlistId: string, itemId: string) => void
  moveSavedPlaylistItemBottom: (playlistId: string, itemId: string) => void
  openPlayer: (video: VideoRecord, options?: { preferQueue?: boolean }) => void
  closePlayer: () => void
  onPlayerEnded: () => void
}

const PlaylistContext = createContext<PlaylistContextValue | null>(null)

const moveItem = <T,>(arr: T[], fromIndex: number, toIndex: number): T[] => {
  const from = Math.max(0, Math.min(arr.length - 1, fromIndex))
  const to = Math.max(0, Math.min(arr.length - 1, toIndex))
  if (from === to) return arr
  const next = [...arr]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

const moveItemById = <T extends { id: string }>(items: T[], id: string, to: 'top' | 'bottom'): T[] => {
  const index = items.findIndex((entry) => entry.id === id)
  if (index === -1) return items
  return moveItem(items, index, to === 'top' ? 0 : items.length - 1)
}

const parseStorage = <T,>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key)
    if (!value) return fallback
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

const playlistNameFallback = (count: number) => `Playlist ${count + 1}`

export function PlaylistProvider({ children }: PropsWithChildren) {
  const [queue, setQueue] = useState<VideoRecord[]>(() => parseStorage<VideoRecord[]>(STORAGE_QUEUE_KEY, []))
  const [savedPlaylists, setSavedPlaylists] = useState<SavedPlaylist[]>(() =>
    parseStorage<SavedPlaylist[]>(STORAGE_PLAYLISTS_KEY, []),
  )

  const [nowPlaying, setNowPlaying] = useState<VideoRecord | null>(null)
  const [playerSource, setPlayerSource] = useState<PlayerSource>({ type: 'single' })

  useEffect(() => {
    localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(queue))
  }, [queue])

  useEffect(() => {
    localStorage.setItem(STORAGE_PLAYLISTS_KEY, JSON.stringify(savedPlaylists))
  }, [savedPlaylists])

  useEffect(() => {
    if (playerSource.type !== 'queue') return
    if (queue.length === 0) {
      setNowPlaying(null)
      setPlayerSource({ type: 'single' })
      return
    }

    const idx = Math.max(0, Math.min(queue.length - 1, playerSource.index))
    const nextPlaying = queue[idx]
    if (!nextPlaying) {
      setNowPlaying(null)
      setPlayerSource({ type: 'single' })
      return
    }

    setNowPlaying(nextPlaying)
    if (idx !== playerSource.index) {
      setPlayerSource({ type: 'queue', index: idx })
    }
  }, [queue, playerSource])

  const addToQueue = useCallback((video: VideoRecord) => {
    setQueue((prev) => [...prev, video])
  }, [])

  const addManyToQueue = useCallback((videos: VideoRecord[]) => {
    setQueue((prev) => [...prev, ...videos])
  }, [])

  const replaceQueue = useCallback((videos: VideoRecord[]) => {
    setQueue(videos)
    if (videos.length === 0) {
      setNowPlaying(null)
      setPlayerSource({ type: 'single' })
    }
  }, [])

  const removeFromQueue = useCallback(
    (id: string) => {
      setQueue((prev) => {
        const idx = prev.findIndex((item) => item.id === id)
        if (idx === -1) return prev

        if (playerSource.type === 'queue') {
          if (idx < playerSource.index) {
            setPlayerSource({ type: 'queue', index: playerSource.index - 1 })
          } else if (idx === playerSource.index) {
            if (prev.length - 1 === 0) {
              setNowPlaying(null)
              setPlayerSource({ type: 'single' })
            }
          }
        }

        return prev.filter((item) => item.id !== id)
      })
    },
    [playerSource],
  )

  const clearQueue = useCallback(() => {
    setQueue([])
    setNowPlaying(null)
    setPlayerSource({ type: 'single' })
  }, [])

  const reorderQueue = useCallback(
    (fromIndex: number, toIndex: number) => {
      setQueue((prev) => {
        if (prev.length < 2) return prev
        const next = moveItem(prev, fromIndex, toIndex)
        if (playerSource.type !== 'queue') return next

        if (fromIndex === playerSource.index) {
          setPlayerSource({ type: 'queue', index: toIndex })
        } else if (fromIndex < playerSource.index && toIndex >= playerSource.index) {
          setPlayerSource({ type: 'queue', index: playerSource.index - 1 })
        } else if (fromIndex > playerSource.index && toIndex <= playerSource.index) {
          setPlayerSource({ type: 'queue', index: playerSource.index + 1 })
        }
        return next
      })
    },
    [playerSource],
  )

  const moveQueueItemTop = useCallback(
    (id: string) => {
      setQueue((prev) => {
        const fromIndex = prev.findIndex((item) => item.id === id)
        if (fromIndex <= 0) return prev
        return moveItem(prev, fromIndex, 0)
      })
    },
    [],
  )

  const moveQueueItemBottom = useCallback(
    (id: string) => {
      setQueue((prev) => {
        const fromIndex = prev.findIndex((item) => item.id === id)
        if (fromIndex === -1 || fromIndex === prev.length - 1) return prev
        return moveItem(prev, fromIndex, prev.length - 1)
      })
    },
    [],
  )

  const createPlaylist = useCallback(
    (name: string) => {
      const now = new Date().toISOString()
      const playlist: SavedPlaylist = {
        id: `pl-${Math.random().toString(36).slice(2, 11)}`,
        name: name.trim() || playlistNameFallback(savedPlaylists.length),
        items: [],
        createdAt: now,
        updatedAt: now,
      }
      setSavedPlaylists((prev) => [...prev, playlist])
      return playlist
    },
    [savedPlaylists.length],
  )

  const renamePlaylist = useCallback((playlistId: string, name: string) => {
    const nextName = name.trim()
    if (!nextName) return
    setSavedPlaylists((prev) =>
      prev.map((playlist) =>
        playlist.id === playlistId ? { ...playlist, name: nextName, updatedAt: new Date().toISOString() } : playlist,
      ),
    )
  }, [])

  const deletePlaylist = useCallback((playlistId: string) => {
    setSavedPlaylists((prev) => prev.filter((playlist) => playlist.id !== playlistId))
  }, [])

  const addToSavedPlaylist = useCallback((playlistId: string, video: VideoRecord) => {
    setSavedPlaylists((prev) =>
      prev.map((playlist) =>
        playlist.id === playlistId
          ? { ...playlist, items: [...playlist.items, video], updatedAt: new Date().toISOString() }
          : playlist,
      ),
    )
  }, [])

  const removeFromSavedPlaylist = useCallback((playlistId: string, itemId: string) => {
    setSavedPlaylists((prev) =>
      prev.map((playlist) =>
        playlist.id === playlistId
          ? {
              ...playlist,
              items: playlist.items.filter((item) => item.id !== itemId),
              updatedAt: new Date().toISOString(),
            }
          : playlist,
      ),
    )
  }, [])

  const replaceSavedPlaylistItems = useCallback((playlistId: string, items: VideoRecord[]) => {
    setSavedPlaylists((prev) =>
      prev.map((playlist) =>
        playlist.id === playlistId ? { ...playlist, items, updatedAt: new Date().toISOString() } : playlist,
      ),
    )
  }, [])

  const reorderSavedPlaylist = useCallback((playlistId: string, fromIndex: number, toIndex: number) => {
    setSavedPlaylists((prev) =>
      prev.map((playlist) =>
        playlist.id === playlistId
          ? {
              ...playlist,
              items: moveItem(playlist.items, fromIndex, toIndex),
              updatedAt: new Date().toISOString(),
            }
          : playlist,
      ),
    )
  }, [])

  const moveSavedPlaylistItemTop = useCallback((playlistId: string, itemId: string) => {
    setSavedPlaylists((prev) =>
      prev.map((playlist) =>
        playlist.id === playlistId
          ? { ...playlist, items: moveItemById(playlist.items, itemId, 'top'), updatedAt: new Date().toISOString() }
          : playlist,
      ),
    )
  }, [])

  const moveSavedPlaylistItemBottom = useCallback((playlistId: string, itemId: string) => {
    setSavedPlaylists((prev) =>
      prev.map((playlist) =>
        playlist.id === playlistId
          ? {
              ...playlist,
              items: moveItemById(playlist.items, itemId, 'bottom'),
              updatedAt: new Date().toISOString(),
            }
          : playlist,
      ),
    )
  }, [])

  const openPlayer = useCallback(
    (video: VideoRecord, options?: { preferQueue?: boolean }) => {
      const shouldUseQueue = options?.preferQueue !== false
      if (shouldUseQueue && queue.length > 0) {
        const index = queue.findIndex((item) => item.id === video.id)
        if (index !== -1) {
          setPlayerSource({ type: 'queue', index })
          setNowPlaying(queue[index])
          return
        }
      }
      setPlayerSource({ type: 'single' })
      setNowPlaying(video)
    },
    [queue],
  )

  const closePlayer = useCallback(() => {
    setNowPlaying(null)
    setPlayerSource({ type: 'single' })
  }, [])

  const onPlayerEnded = useCallback(() => {
    setPlayerSource((prev) => {
      if (prev.type !== 'queue') {
        setNowPlaying(null)
        return { type: 'single' }
      }
      const nextIndex = prev.index + 1
      if (nextIndex >= queue.length) {
        setNowPlaying(null)
        return { type: 'single' }
      }
      setNowPlaying(queue[nextIndex])
      return { type: 'queue', index: nextIndex }
    })
  }, [queue])

  const value = useMemo<PlaylistContextValue>(
    () => ({
      queue,
      savedPlaylists,
      nowPlaying,
      addToQueue,
      addManyToQueue,
      replaceQueue,
      removeFromQueue,
      clearQueue,
      reorderQueue,
      moveQueueItemTop,
      moveQueueItemBottom,
      createPlaylist,
      renamePlaylist,
      deletePlaylist,
      addToSavedPlaylist,
      removeFromSavedPlaylist,
      replaceSavedPlaylistItems,
      reorderSavedPlaylist,
      moveSavedPlaylistItemTop,
      moveSavedPlaylistItemBottom,
      openPlayer,
      closePlayer,
      onPlayerEnded,
    }),
    [
      queue,
      savedPlaylists,
      nowPlaying,
      addToQueue,
      addManyToQueue,
      replaceQueue,
      removeFromQueue,
      clearQueue,
      reorderQueue,
      moveQueueItemTop,
      moveQueueItemBottom,
      createPlaylist,
      renamePlaylist,
      deletePlaylist,
      addToSavedPlaylist,
      removeFromSavedPlaylist,
      replaceSavedPlaylistItems,
      reorderSavedPlaylist,
      moveSavedPlaylistItemTop,
      moveSavedPlaylistItemBottom,
      openPlayer,
      closePlayer,
      onPlayerEnded,
    ],
  )

  return <PlaylistContext.Provider value={value}>{children}</PlaylistContext.Provider>
}

export function usePlaylistContext(): PlaylistContextValue {
  const ctx = useContext(PlaylistContext)
  if (!ctx) throw new Error('usePlaylistContext must be used within PlaylistProvider')
  return ctx
}
