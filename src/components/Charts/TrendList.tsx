type TrendRow = {
  id: string
  totalPlays: number
  trend: string
}

type Props = {
  rows: TrendRow[]
}

const colorForTrend = (trend: string) => {
  if (trend === 'Rising Fast') return '#16a34a'
  if (trend === 'Cooling Off') return '#f59e0b'
  if (trend === 'Spike') return '#2563eb'
  if (trend === 'Dormant') return '#6b7280'
  if (trend === 'New Discovery') return '#9333ea'
  return '#334155'
}

export default function TrendList({ rows }: Props) {
  return (
    <section className="section">
      <h2 className="section-title">Trend Signals</h2>
      {rows.length === 0 ? (
        <p className="muted">No trend data available.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((row) => (
            <div
              key={row.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: 10,
                alignItems: 'center',
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                background: '#fff',
              }}
            >
              <code style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.id}</code>
              <span>{row.totalPlays} plays</span>
              <span
                style={{
                  color: '#fff',
                  background: colorForTrend(row.trend),
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: 12,
                }}
              >
                {row.trend}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
