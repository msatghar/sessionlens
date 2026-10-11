import type { ParsedSession } from '../lib/types'

export function FilesView({ session }: { session: ParsedSession }) {
  const { stats } = session
  const tools = Object.entries(stats.toolsByName).sort((a, b) => b[1] - a[1])
  const max = tools[0]?.[1] ?? 1

  return (
    <section className="files">
      <div className="panel">
        <h3>Files changed ({stats.filesTouched.length})</h3>
        {stats.filesTouched.length === 0 ? (
          <p className="subtle">No files were edited.</p>
        ) : (
          <ul className="plain mono">
            {stats.filesTouched.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="panel">
        <h3>Commands run ({stats.commands.length})</h3>
        {stats.commands.length === 0 ? (
          <p className="subtle">No shell commands.</p>
        ) : (
          <ul className="plain mono">
            {stats.commands.map((c, i) => (
              <li key={i}>$ {c}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="panel">
        <h3>Tools used</h3>
        <ul className="bars">
          {tools.map(([name, count]) => (
            <li key={name}>
              <span className="bar-label">{name}</span>
              <span className="bar-track">
                <span className="bar" style={{ width: `${(count / max) * 100}%` }} />
              </span>
              <span className="bar-value">{count}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
