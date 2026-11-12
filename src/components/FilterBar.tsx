import type { Label, Member, Priority } from '../types'
import { SearchIcon } from './Icons'

export interface Filters {
  search: string
  priority: Priority | 'all'
  labelId: string
  memberId: string
}

export const EMPTY_FILTERS: Filters = { search: '', priority: 'all', labelId: 'all', memberId: 'all' }

interface Props {
  filters: Filters
  onChange: (f: Filters) => void
  labels: Label[]
  members: Member[]
  shown: number
  total: number
}

export function FilterBar({ filters, onChange, labels, members, shown, total }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  const active =
    filters.search !== '' || filters.priority !== 'all' || filters.labelId !== 'all' || filters.memberId !== 'all'

  return (
    <div className="filters">
      <label className="search">
        <SearchIcon size={16} />
        <span className="sr-only">Search tasks</span>
        <input
          type="search"
          placeholder="Search tasks…"
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
        />
      </label>

      <label className="select-wrap">
        <span className="sr-only">Priority</span>
        <select value={filters.priority} onChange={(e) => set({ priority: e.target.value as Filters['priority'] })}>
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
      </label>

      {members.length > 0 && (
        <label className="select-wrap">
          <span className="sr-only">Assignee</span>
          <select value={filters.memberId} onChange={(e) => set({ memberId: e.target.value })}>
            <option value="all">Everyone</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
      )}

      {labels.length > 0 && (
        <div className="chips" role="group" aria-label="Filter by label">
          <button
            type="button"
            className={`chip${filters.labelId === 'all' ? ' chip-on' : ''}`}
            aria-pressed={filters.labelId === 'all'}
            onClick={() => set({ labelId: 'all' })}
          >
            All
          </button>
          {labels.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`chip${filters.labelId === l.id ? ' chip-on' : ''}`}
              aria-pressed={filters.labelId === l.id}
              onClick={() => set({ labelId: filters.labelId === l.id ? 'all' : l.id })}
            >
              <span className="dot" style={{ background: l.color }} />
              {l.name}
            </button>
          ))}
        </div>
      )}

      {active && (
        <div className="filter-status">
          Showing {shown} of {total}
          <button type="button" className="link-btn" onClick={() => onChange(EMPTY_FILTERS)}>Clear</button>
        </div>
      )}
    </div>
  )
}
