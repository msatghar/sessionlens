import { useMemo, useState } from 'react'
import type { SessionSource } from '../lib/source'
import { formatDate } from '../lib/format'

interface Props {
  source: SessionSource | null
  selected: string | null
  onSelect: (id: string) => void
  onRefresh: () => void
}

export function Sidebar({ source, selected, onSelect, onRefresh }: Props) {
  const [query, setQuery] = useState('')
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = source?.sessions ?? []
    if (!q) return all
    return all.filter((s) => s.title.toLowerCase().includes(q) || s.project.toLowerCase().includes(q))
  }, [source, query])

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="logo" aria-hidden>
          ◎
        </span>
        <span>sessionlens</span>
        {source?.mode === 'local' && (
          <button className="icon-btn" onClick={onRefresh} title="Rescan sessions" aria-label="Rescan sessions">
            ↻
          </button>
        )}
      </div>
      <input
        className="search"
        type="search"
        placeholder="Search sessions"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search sessions"
      />
      <div className="source-note">
        {source ? (
          <>
            {list.length} session{list.length === 1 ? '' : 's'} · {source.folder}
          </>
        ) : (
          'Loading…'
        )}
      </div>
      <ul className="session-list">
        {list.map((s) => (
          <li key={s.id}>
            <button className={s.id === selected ? 'session active' : 'session'} onClick={() => onSelect(s.id)}>
              <span className="session-title">{s.title}</span>
              <span className="session-meta">
                {s.project && <span className="project">{s.project}</span>}
                <span>{formatDate(s.modifiedAt)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="privacy-note">Your logs never leave this machine.</p>
    </aside>
  )
}
