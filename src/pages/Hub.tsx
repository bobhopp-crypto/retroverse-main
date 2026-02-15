import { Link } from 'react-router-dom'

const pages = [
  { to: '/video-library', label: 'Video Library', desc: 'Static listing from video-index.json' },
  { to: '/playlists', label: 'Playlists', desc: 'Playlist shells, no persistence yet' },
  { to: '/random', label: 'Random', desc: 'Future one-click randomizer layout' },
  { to: '/matching', label: 'Matching', desc: 'Match review table scaffold' },
  { to: '/games', label: 'Games', desc: 'Game concepts placeholder' },
  { to: '/tools', label: 'Tools', desc: 'Utility roster; disabled' },
]

export default function Hub() {
  return (
    <section>
      <div className="page-heading">
        <h1 className="page-title">Hub</h1>
        <span className="phase-flag">Phase 0 – structure only</span>
      </div>
      <p className="muted">Choose a section to view its skeleton. Nothing is wired or interactive yet.</p>

      <div className="section" style={{ padding: 0 }}>
        <table className="simple-table">
          <thead>
            <tr>
              <th>Page</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => (
              <tr key={page.to}>
                <td>
                  <Link to={page.to} className="link-plain">
                    {page.label}
                  </Link>
                </td>
                <td className="muted">{page.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
