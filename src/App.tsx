import { useEffect, useMemo, useState } from 'react'
import { parseSession } from './lib/parse'
import { scoreSession } from './lib/score'
import { connect, type SessionSource } from './lib/source'
import { Sidebar } from './components/Sidebar'
import { SessionHeader } from './components/SessionHeader'
import { Timeline } from './components/Timeline'
import { ScorecardView } from './components/ScorecardView'
import { FilesView } from './components/FilesView'

type Tab = 'timeline' | 'scorecard' | 'files'

export function App() {
  const [source, setSource] = useState<SessionSource | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [raw, setRaw] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('timeline')
  const [focus, setFocus] = useState<string | null>(null)

  const refresh = async (force = false) => {
    const s = await connect(force)
    setSource(s)
    setSelected((cur) => (cur && s.sessions.some((x) => x.id === cur) ? cur : (s.sessions[0]?.id ?? null)))
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (!source || !selected) return
    let live = true
    setLoading(true)
    setError('')
    source
      .load(selected)
      .then((text) => live && setRaw(text))
      .catch((e) => live && setError(String(e.message ?? e)))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [source, selected])

  const session = useMemo(() => (raw && selected ? parseSession(raw, selected) : null), [raw, selected])
  const scorecard = useMemo(() => (session ? scoreSession(session) : null), [session])

  const jumpTo = (itemId: string) => {
    setTab('timeline')
    setFocus(itemId)
  }

  return (
    <div className="app">
      <Sidebar
        source={source}
        selected={selected}
        onSelect={(id) => {
          setSelected(id)
          setFocus(null)
        }}
        onRefresh={() => refresh(true)}
      />
      <main className="main">
        {source?.mode === 'demo' && (
          <div className="banner">
            You're looking at made-up sample sessions. Run <code>npx @manalisatghar/sessionlens</code> to see your own, privately on your
            machine.
          </div>
        )}
        {!source && <div className="empty">Looking for sessions…</div>}
        {source && source.sessions.length === 0 && (
          <div className="empty">
            No session logs found in <code>{source.folder}</code>.
          </div>
        )}
        {error && <div className="empty error-text">{error}</div>}
        {session && scorecard && !error && (
          <>
            <SessionHeader session={session} scorecard={scorecard} loading={loading} />
            <nav className="tabs" role="tablist">
              {(
                [
                  ['timeline', 'Timeline'],
                  ['scorecard', 'Scorecard'],
                  ['files', 'Files & commands'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  className={tab === key ? 'tab active' : 'tab'}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
            {tab === 'timeline' && <Timeline session={session} focus={focus} />}
            {tab === 'scorecard' && <ScorecardView scorecard={scorecard} onJump={jumpTo} />}
            {tab === 'files' && <FilesView session={session} />}
          </>
        )}
      </main>
    </div>
  )
}
