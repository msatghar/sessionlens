import type { Scorecard, CheckStatus } from '../lib/score'

const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: 'Pass',
  partial: 'Partly',
  fail: 'Miss',
  na: 'Not applicable',
}

export function ScorecardView({ scorecard, onJump }: { scorecard: Scorecard; onJump: (id: string) => void }) {
  return (
    <section className="scorecard">
      <p className="subtle intro">
        Four checks on how the agent worked, not whether the code is right. They are simple heuristics over the log, so
        treat them as a starting point for review.
      </p>
      <ul className="checks">
        {scorecard.checks.map((c) => (
          <li key={c.id} className={`check check-${c.status}`}>
            <div className="check-head">
              <h3>{c.label}</h3>
              <span className={`status status-${c.status}`}>{STATUS_LABEL[c.status]}</span>
            </div>
            <p className="subtle">{c.question}</p>
            <p>{c.detail}</p>
            {c.evidence && (
              <button className="link" onClick={() => onJump(c.evidence!)}>
                Show in timeline →
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
