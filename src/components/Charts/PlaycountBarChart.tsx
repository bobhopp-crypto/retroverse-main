import { useState } from 'react'

type Props = {
  title: string
  values: Array<{ label: string; value: number }>
  styleMode: string
  colorForLabel?: (label: string) => string | undefined
  onRowClick?: (label: string) => void
}

const styleClass = (styleMode: string) => {
  if (styleMode === 'neon') return 'bg-cyan-400'
  if (styleMode === 'modern') return 'bg-blue-600'
  if (styleMode === 'radio') return 'bg-amber-500'
  if (styleMode === 'cartoon') return 'bg-rose-500'
  return 'bg-slate-700'
}

export default function PlaycountBarChart({ title, values, styleMode, colorForLabel, onRowClick }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const max = values.reduce((acc, row) => Math.max(acc, row.value), 0) || 1

  return (
    <section className="section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h2 className="section-title" style={{ margin: 0 }}>{title}</h2>
        <button type="button" onClick={() => setCollapsed((prev) => !prev)} style={{ padding: '4px 10px' }}>
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      {!collapsed ? (
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          {values.map((row) => (
            <div
              key={row.label}
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row.label) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onRowClick(row.label)
                      }
                    }
                  : undefined
              }
              style={{
                display: 'grid',
                gridTemplateColumns: '130px 1fr 60px',
                alignItems: 'center',
                gap: 10,
                cursor: onRowClick ? 'pointer' : 'default',
              }}
            >
              <span className="muted">{row.label}</span>
              <div style={{ background: '#e5e7eb', borderRadius: 999, height: 12, overflow: 'hidden' }}>
                <div
                  className={styleClass(styleMode)}
                  style={{
                    width: `${Math.max(2, (row.value / max) * 100)}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: colorForLabel?.(row.label),
                  }}
                />
              </div>
              <strong style={{ textAlign: 'right' }}>{row.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
