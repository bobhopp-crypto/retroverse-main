const columns = ['Video ID', 'Song ID', 'Confidence', 'Reasons']

export default function Matching() {
  return (
    <section className="stack">
      <div className="page-heading">
        <h1 className="page-title">Matching</h1>
        <span className="phase-flag">Phase 0 – structure only</span>
      </div>
      <p className="muted">Table skeleton for future video↔song matches. No computation occurs here.</p>

      <div className="section" style={{ padding: 0 }}>
        <table className="simple-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={4} className="muted">
                Placeholder rows will live here once matches are generated.
              </td>
            </tr>
            <tr>
              <td>video-id</td>
              <td>song-id</td>
              <td>—</td>
              <td>Confidence notes / heuristic reasons (empty)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="section">
        <h2 className="section-title">Notes</h2>
        <div className="placeholder-box">
          Confidence column is a placeholder. Matching logic and decision review are intentionally absent in Phase 0.
        </div>
      </div>
    </section>
  )
}
