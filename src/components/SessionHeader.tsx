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
  const { usage } = stats
  const totalIn = usage.input + usage.cacheRead + usage.cacheWrite
  const cachedPct = totalIn ? Math.round((usage.cacheRead / totalIn) * 100) : 0
  const tokenHelp = [
    'Tokens the model read (in) and wrote (out), summed over every step.',
    `Fresh input: ${usage.input.toLocaleString()}`,
    `Read from cache: ${usage.cacheRead.toLocaleString()}`,
    `Written to cache: ${usage.cacheWrite.toLocaleString()}`,
    `Output: ${usage.output.toLocaleString()}`,
  ].join('\n')
  const chips: { label: string; value: string; note?: string; help?: string }[] = [
    { label: 'Duration', value: formatDuration(stats.durationMs) },
    { label: 'Your prompts', value: String(stats.prompts) },
    { label: 'Tool calls', value: String(stats.toolCalls) },
    { label: 'Tool errors', value: String(stats.toolErrors) },
    { label: 'Files changed', value: String(stats.filesTouched.length) },
    {
      label: 'Tokens in / out',
      value: `${formatTokens(totalIn)} / ${formatTokens(usage.output)}`,
      note: totalIn ? `${cachedPct}% of input from cache` : undefined,
      help: tokenHelp,
    },
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
        {chips.map(({ label, value, note, help }) => (
          <div className="chip" key={label} title={help} tabIndex={help ? 0 : undefined}>
            <dt>{label}</dt>
            <dd className={label === 'Tool errors' && stats.toolErrors > 0 ? 'error-text' : ''}>{value}</dd>
            {note && <dd className="chip-note">{note}</dd>}
          </div>
        ))}
      </dl>
    </header>
  )
}
