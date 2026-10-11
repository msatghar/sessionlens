import { parseSession } from './parse'
import { scoreSession } from './score'
import { SAMPLE_SESSIONS } from '../data/samples'

const byId = (id: string) => scoreSession(parseSession(SAMPLE_SESSIONS.find((s) => s.summary.id === id)!.raw, id))
const status = (card: ReturnType<typeof scoreSession>, id: string) => card.checks.find((c) => c.id === id)!.status

describe('scoreSession', () => {
  it('gives a careful session full marks', () => {
    const card = byId('demo-invoices')
    expect(card.checks.map((c) => c.status)).toEqual(['pass', 'pass', 'pass', 'pass'])
    expect(card.grade).toBe('A')
  })

  it('gives partial credit when code changed after the last check and the wrap up is thin', () => {
    const card = byId('demo-darkmode')
    expect(status(card, 'verified')).toBe('partial')
    expect(status(card, 'wrap-up')).toBe('partial')
    expect(status(card, 'owned-errors')).toBe('pass')
    expect(card.grade).toBe('B')
  })

  it('flags a silent session that ignores errors and never reports back', () => {
    const card = byId('demo-search')
    expect(status(card, 'in-the-loop')).toBe('fail')
    expect(status(card, 'owned-errors')).toBe('fail')
    expect(status(card, 'wrap-up')).toBe('fail')
    expect(status(card, 'verified')).toBe('fail')
    expect(card.grade).toBe('D')
  })

  it('points every failed check at evidence in the timeline', () => {
    const card = byId('demo-search')
    for (const c of card.checks) expect(c.evidence).toBeTruthy()
  })

  it('marks checks that do not apply instead of guessing', () => {
    const raw = JSON.stringify({ type: 'user', message: { content: 'just a question' } })
    const card = scoreSession(parseSession(raw))
    expect(card.score).toBeNull()
    expect(card.grade).toBe('—')
  })
})
