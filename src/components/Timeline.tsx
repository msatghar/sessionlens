import { useEffect, useMemo, useRef, useState } from 'react'
import type { ParsedSession, TimelineItem } from '../lib/types'
import { clip, formatTime, shortPath } from '../lib/format'

type Filter = 'prompt' | 'message' | 'tool' | 'error' | 'thinking'

const FILTERS: [Filter, string][] = [
  ['prompt', 'Your prompts'],
  ['message', 'Agent replies'],
  ['tool', 'Tool calls'],
  ['error', 'Errors only'],
  ['thinking', 'Thinking'],
]

const OUTPUT_PREVIEW = 1200

/** Render `inline code` from markdown; everything else stays plain text (no HTML injection). */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`)/g)
  return (
    <p className="text">
      {parts.map((p, i) => (p.startsWith('`') && p.endsWith('`') && p.length > 2 ? <code key={i}>{p.slice(1, -1)}</code> : p))}
    </p>
  )
}

function matches(item: TimelineItem, q: string) {
  if (!q) return true
  const hay =
    item.kind === 'tool' ? `${item.name} ${item.summary} ${item.output} ${JSON.stringify(item.input)}` : item.text
  return hay.toLowerCase().includes(q)
}

function ToolCard({ item, open, onToggle }: { item: Extract<TimelineItem, { kind: 'tool' }>; open: boolean; onToggle: () => void }) {
  const [full, setFull] = useState(false)
  const cmd = typeof item.input.command === 'string' ? item.input.command : ''
  const label = item.summary && item.summary !== cmd ? item.summary : ''
  const status = item.pending ? 'no result' : item.isError ? 'error' : 'ok'
  return (
    <div className={`tool ${item.isError ? 'tool-error' : ''}`}>
      <button className="tool-head" onClick={onToggle} aria-expanded={open}>
        <span className="tool-name">{item.name}</span>
        <span className="tool-summary">{label ? clip(label.includes('/') ? shortPath(label) : label, 110) : clip(cmd, 110)}</span>
        <span className={`status status-${status.replace(' ', '-')}`}>{status}</span>
      </button>
      {open && (
        <div className="tool-body">
          {cmd && <pre className="code">$ {cmd}</pre>}
          {!cmd && Object.keys(item.input).length > 0 && (
            <pre className="code">{clip(JSON.stringify(item.input, null, 2), 2000)}</pre>
          )}
          {item.output && (
            <>
              <pre className={`code output ${item.isError ? 'error-text' : ''}`}>
                {full ? item.output : clip(item.output, OUTPUT_PREVIEW)}
              </pre>
              {item.output.length > OUTPUT_PREVIEW && (
                <button className="link" onClick={() => setFull(!full)}>
                  {full ? 'Show less' : `Show all ${item.output.length.toLocaleString()} characters`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function Timeline({ session, focus }: { session: ParsedSession; focus: string | null }) {
  const [active, setActive] = useState<Set<Filter>>(new Set(['prompt', 'message', 'tool']))
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const refs = useRef(new Map<string, HTMLLIElement>())

  useEffect(() => {
    if (!focus) return
    setOpen((o) => new Set(o).add(focus))
    setActive((a) => new Set(a).add('tool').add('message'))
    requestAnimationFrame(() => refs.current.get(focus)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }, [focus])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const errorsOnly = active.has('error')
    return session.items.filter((item) => {
      if (errorsOnly) return item.kind === 'tool' && item.isError && matches(item, q)
      return active.has(item.kind as Filter) && matches(item, q)
    })
  }, [session, active, query])

  const toggleFilter = (f: Filter) =>
    setActive((cur) => {
      const next = new Set(cur)
      next.has(f) ? next.delete(f) : next.add(f)
      return next
    })

  return (
    <section className="timeline-wrap">
      <div className="toolbar">
        <div className="filters" role="group" aria-label="Show">
          {FILTERS.map(([key, label]) => (
            <button key={key} className={active.has(key) ? 'pill on' : 'pill'} aria-pressed={active.has(key)} onClick={() => toggleFilter(key)}>
              {label}
            </button>
          ))}
        </div>
        <input
          className="search small"
          type="search"
          placeholder="Search this session"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search this session"
        />
      </div>
      {visible.length === 0 && <p className="empty">Nothing matches these filters.</p>}
      <ol className="timeline">
        {visible.map((item) => (
          <li
            key={item.id}
            ref={(el) => {
              if (el) refs.current.set(item.id, el)
              else refs.current.delete(item.id)
            }}
            className={`event event-${item.kind} ${item.id === focus ? 'focused' : ''} ${'subagent' in item && item.subagent ? 'subagent' : ''}`}
          >
            <span className="time">{formatTime(item.ts)}</span>
            <div className="event-body">
              {item.kind === 'prompt' && (
                <>
                  <span className="who">You</span>
                  <RichText text={item.text} />
                </>
              )}
              {item.kind === 'message' && (
                <>
                  <span className="who">{item.subagent ? 'Subagent' : 'Agent'}</span>
                  <RichText text={item.text} />
                </>
              )}
              {item.kind === 'thinking' && (
                <details>
                  <summary className="who">Thinking</summary>
                  <p className="text subtle">{item.text}</p>
                </details>
              )}
              {item.kind === 'tool' && (
                <ToolCard
                  item={item}
                  open={open.has(item.id)}
                  onToggle={() =>
                    setOpen((o) => {
                      const n = new Set(o)
                      n.has(item.id) ? n.delete(item.id) : n.add(item.id)
                      return n
                    })
                  }
                />
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
