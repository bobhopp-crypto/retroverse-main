import { NavLink } from 'react-router-dom'
import type { PropsWithChildren } from 'react'
import { usePlaylistContext } from '../context/PlaylistContext'
import VideoPlayerModal from './VideoPlayerModal'

const desktopNavItems = [
  { to: '/hub', label: 'Hub' },
  { to: '/video-library', label: 'Video Library' },
  { to: '/playlists', label: 'Playlists' },
  { to: '/random', label: 'SetBuilder' },
  { to: '/matching', label: 'Matching' },
  { to: '/games', label: 'Games' },
  { to: '/tools', label: 'Tools' },
  { to: '/analytics', label: 'Analytics' },
]

const mobileNavItems = [
  { to: '/video-library', label: 'Library' },
  { to: '/playlists', label: 'Playlists' },
  { to: '/random', label: 'SetBuilder' },
  { to: '/analytics', label: 'Analytics' },
]

export default function Layout({ children }: PropsWithChildren) {
  const { queue, nowPlaying, closePlayer, onPlayerEnded } = usePlaylistContext()

  return (
    <div className="app-shell">
      <div className="rv-frame">
        <header className="topbar">
          <div className="brand">RetroVerse</div>
          <nav className="nav">
            {desktopNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => ['nav-link', isActive ? 'nav-link--active' : ''].join(' ')}
              >
                {item.to === '/playlists' ? `Playlists (${queue.length})` : item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <div className="content-scroll">
          <main className="main-panel">{children}</main>
        </div>

        <nav className="bottom-nav" aria-label="Mobile navigation">
          {mobileNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => ['tab', isActive ? 'active' : ''].join(' ')}
            >
              <span>{item.to === '/playlists' ? `Playlists (${queue.length})` : item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <VideoPlayerModal video={nowPlaying} onClose={closePlayer} onEnded={onPlayerEnded} />
    </div>
  )
}
