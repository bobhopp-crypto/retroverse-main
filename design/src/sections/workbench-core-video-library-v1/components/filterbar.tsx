type SortOption = 'title' | 'popularity' | 'year'

interface FilterBarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  selectedDecade: string | null
  onDecadeChange: (decade: string | null) => void
  sortBy: SortOption
  onSortChange: (sort: SortOption) => void
}

const DECADES = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s']

export function FilterBar({
  searchQuery,
  onSearchChange,
  selectedDecade,
  onDecadeChange,
  sortBy,
  onSortChange,
}: FilterBarProps) {
  return (
    <div className="space-y-3 sm:space-y-4 p-3 sm:p-4 border-b bg-[var(--rv-bg-panel)]" style={{ borderColor: 'var(--rv-border)' }}>
      {/* Search box */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Look up . . . "
        className="w-full px-3 sm:px-4 py-2 rounded text-sm sm:text-base focus:outline-none focus:ring-2 focus:border-[var(--rv-focus)] focus:ring-[var(--rv-focus)]/20"
        style={{
          background: 'var(--rv-bg-base)',
          border: '1px solid var(--rv-border)',
          color: 'var(--rv-text)',
        }}
      />

      {/* Decade filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onDecadeChange(null)}
          className={`px-3 py-1 rounded text-sm transition-colors ${
            selectedDecade === null
              ? 'bg-[var(--rv-chip-selected)] text-[var(--rv-bg-base)]'
              : 'bg-[var(--rv-bg-hover)] hover:bg-[var(--rv-border)]'
          }`}
          style={selectedDecade !== null ? { color: 'var(--rv-text-muted)' } : undefined}
        >
          All
        </button>
        {DECADES.map((decade) => (
          <button
            key={decade}
            onClick={() => onDecadeChange(decade)}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              selectedDecade === decade
                ? 'bg-[var(--rv-chip-selected)] text-[var(--rv-bg-base)]'
                : 'bg-[var(--rv-bg-hover)] hover:bg-[var(--rv-border)]'
            }`}
            style={selectedDecade !== decade ? { color: 'var(--rv-text-muted)' } : undefined}
          >
            {decade}
          </button>
        ))}
      </div>

      {/* Sort toggle group */}
      <div className="flex gap-2">
        <span className="text-sm mr-2" style={{ color: 'var(--rv-text-muted)' }}>Sort:</span>
        <button
          onClick={() => onSortChange('title')}
          className={`px-3 py-1 rounded text-sm transition-colors ${
            sortBy === 'title'
              ? 'bg-[var(--rv-accent)]'
              : 'bg-[var(--rv-bg-hover)] hover:bg-[var(--rv-border)]'
          }`}
          style={sortBy === 'title' ? { color: 'var(--rv-text)' } : { color: 'var(--rv-text-muted)' }}
        >
          A–Z
        </button>
        <button
          onClick={() => onSortChange('popularity')}
          className={`px-3 py-1 rounded text-sm transition-colors ${
            sortBy === 'popularity'
              ? 'bg-[var(--rv-accent)]'
              : 'bg-[var(--rv-bg-hover)] hover:bg-[var(--rv-border)]'
          }`}
          style={sortBy === 'popularity' ? { color: 'var(--rv-text)' } : { color: 'var(--rv-text-muted)' }}
        >
          Popularity
        </button>
        <button
          onClick={() => onSortChange('year')}
          className={`px-3 py-1 rounded text-sm transition-colors ${
            sortBy === 'year'
              ? 'bg-[var(--rv-accent)]'
              : 'bg-[var(--rv-bg-hover)] hover:bg-[var(--rv-border)]'
          }`}
          style={sortBy === 'year' ? { color: 'var(--rv-text)' } : { color: 'var(--rv-text-muted)' }}
        >
          Year
        </button>
      </div>
    </div>
  )
}
