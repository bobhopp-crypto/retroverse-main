import { Link } from 'react-router-dom'

const tools = [
  { name: 'Metadata viewer', status: 'planned' },
  { name: 'Playlist maintenance', status: 'planned' },
  { name: 'Match review helper', status: 'planned' },
  { name: 'Export packager', status: 'planned' },
  { name: 'Analytics dashboard', status: 'active' },
  { name: 'Data updater (legacy)', status: 'deprecated' },
]

export default function Tools() {
  return (
    <section className="stack">
      <div className="page-heading">
        <h1 className="page-title">Tools</h1>
        <span className="phase-flag">Phase 0 – structure only</span>
      </div>
      <p>
        <Link to="/analytics">Open Analytics</Link>
      </p>
      <p className="muted">List of intended utilities. Nothing executes in this phase.</p>

      <div className="section" style={{ padding: 0 }}>
        <table className="simple-table">
          <thead>
            <tr>
              <th>Tool</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {tools.map((tool) => (
              <tr key={tool.name}>
                <td>{tool.name}</td>
                <td>{tool.status === 'deprecated' ? 'deprecated' : tool.status === 'active' ? 'active' : 'planned'}</td>
                <td className="muted">
                  {tool.status === 'deprecated'
                    ? 'Do not use. Replaced by future pipeline.'
                    : tool.status === 'active'
                      ? 'Live page available under Analytics.'
                      : 'Structure only; execution disabled.'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
