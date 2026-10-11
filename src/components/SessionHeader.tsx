import type { ParsedSession } from '../lib/types'
import type { Scorecard } from '../lib/score'
import { formatDate, formatDuration, formatTokens } from '../lib/format'

interface Props {
  session: ParsedSession
  scorecard: Scorecard
  loading: boolean
}

export function SessionHeader({ session, scorecard, loading }: Props) {
  const { stats } = session
  const totalIn = stats.usage.input + stats.usage.cacheRead + stats.usage.cacheWrite
  const chips: [string, string][] = [
    ['Duration', formatDuration(stats.durationMs)],
    ['Your prompts', String(stats.prompts)],
    ['Tool calls', String(stats.toolCalls)],
    ['Tool errors', String(stats.toolErrors)],
    ['Files changed', String(stats.filesTouched.length)],
    ['Tokens in / out', `${formatTokens(totalIn)} / ${formatTokens(stats.usage.output)}`],
  ]

  return (
    <header className="session-header">
      <div className="header-top">
        <div>
          <h1>{session.title}</h1>
          <p className="subtle">
            {stats.startedAt ? formatDate(stats.startedAt) : ''}
            {stats.models.length > 0 && <> · {stats.models.join(', ')}</>}
            {loading && <> · loading…</>}
            {session.skippedLines > 0 && <> · {session.skippedLines} unreadable lines skipped</>}
          </p>
        </div>
        <div className={`grade grade-${scorecard.grade === '—' ? 'na' : scorecard.grade}`} title="Overall scorecard grade">
          <span className="grade-letter">{scorecard.grade}</span>
          <span className="grade-label">{scorecard.score === null ? 'not scored' : `${scorecard.score}/100`}</span>
        </div>
      </div>
      <dl className="chips">
        {chips.map(([label, value]) => (
          <div className="chip" key={label}>
            <dt>{label}</dt>
            <dd className={label === 'Tool errors' && stats.toolErrors > 0 ? 'error-text' : ''}>{value}</dd>
          </div>
        ))}
      </dl>
    </header>
  )
}
