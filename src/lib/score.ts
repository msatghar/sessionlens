import type { ParsedSession, TimelineItem } from './types'

export type CheckStatus = 'pass' | 'partial' | 'fail' | 'na'

export interface Check {
  id: 'verified' | 'in-the-loop' | 'owned-errors' | 'wrap-up'
  label: string
  question: string
  status: CheckStatus
  detail: string
  /** Timeline item to jump to as evidence. */
  evidence?: string
}

export interface Scorecard {
  checks: Check[]
  /** 0 to 100 over the checks that apply, or null when none apply. */
  score: number | null
  grade: 'A' | 'B' | 'C' | 'D' | '—'
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

// Commands that check work: tests, type checks, builds and linters across common stacks.
const VERIFY_RE =
  /\b(test|tests|pytest|vitest|jest|mocha|karma|rspec|phpunit|ctest|tsc|mypy|pyright|eslint|ruff|clippy|lint|typecheck|build|compile|cargo (test|check|build)|go (test|vet|build)|make( |$)|gradle|mvn)\b/i

const ADMIT_RE =
  /\b(error|errors|fail|fails|failed|failing|failure|couldn'?t|could not|can'?t|cannot|didn'?t work|did not work|issue|problem|broke|broken|wrong|mistake|unable|blocked|not found)\b/i

const STREAK_OK = 8
const STREAK_BAD = 15
const WRAP_UP_MIN_CHARS = 120

function mainThread(items: TimelineItem[]) {
  return items.filter((i) => !('subagent' in i && i.subagent))
}

function checkVerified(items: TimelineItem[]): Check {
  const base = {
    id: 'verified' as const,
    label: 'Checked its own work',
    question: 'After changing code, did it run tests, a build or a type check?',
  }
  const tools = items.filter((i): i is Extract<TimelineItem, { kind: 'tool' }> => i.kind === 'tool')
  const edits = tools.filter((t) => EDIT_TOOLS.has(t.name))
  if (edits.length === 0) return { ...base, status: 'na', detail: 'No code was changed in this session.' }

  const lastEdit = items.lastIndexOf(edits[edits.length - 1])
  const isVerify = (t: (typeof tools)[number]) =>
    t.name === 'Bash' && typeof t.input.command === 'string' && VERIFY_RE.test(t.input.command)
  const after = tools.filter((t) => items.indexOf(t) > lastEdit && isVerify(t))
  if (after.length) {
    const last = after[after.length - 1]
    const outcome = last.isError ? 'it reported a failure' : 'it ran cleanly'
    return { ...base, status: 'pass', detail: `Ran a check after the last edit, and ${outcome}.`, evidence: last.id }
  }
  const any = tools.find(isVerify)
  if (any) {
    return {
      ...base,
      status: 'partial',
      detail: 'Ran checks earlier, but changed code again afterwards without re-checking.',
      evidence: edits[edits.length - 1].id,
    }
  }
  return {
    ...base,
    status: 'fail',
    detail: `Changed ${edits.length} file${edits.length === 1 ? '' : 's'} without running any tests or builds.`,
    evidence: edits[edits.length - 1].id,
  }
}

function checkInTheLoop(items: TimelineItem[]): Check {
  const base = {
    id: 'in-the-loop' as const,
    label: 'Kept you in the loop',
    question: 'Did it explain what it was doing between long runs of tool calls?',
  }
  let streak = 0
  let longest = 0
  let longestStart: string | undefined
  let currentStart: string | undefined
  for (const item of items) {
    if (item.kind === 'tool') {
      if (streak === 0) currentStart = item.id
      streak++
      if (streak > longest) {
        longest = streak
        longestStart = currentStart
      }
    } else if (item.kind === 'message' || item.kind === 'prompt') {
      streak = 0
    }
  }
  if (longest === 0) return { ...base, status: 'na', detail: 'No tool calls in this session.' }
  const detail = `Longest silent stretch: ${longest} tool call${longest === 1 ? '' : 's'} in a row with no update.`
  if (longest <= STREAK_OK) return { ...base, status: 'pass', detail, evidence: longestStart }
  if (longest <= STREAK_BAD) return { ...base, status: 'partial', detail, evidence: longestStart }
  return { ...base, status: 'fail', detail, evidence: longestStart }
}

function checkOwnedErrors(items: TimelineItem[]): Check {
  const base = {
    id: 'owned-errors' as const,
    label: 'Owned its errors',
    question: 'When a tool failed, did it say so instead of quietly moving on?',
  }
  const errors: number[] = []
  items.forEach((i, idx) => {
    if (i.kind === 'tool' && i.isError) errors.push(idx)
  })
  if (errors.length === 0) return { ...base, status: 'na', detail: 'No tool errors in this session.' }

  let owned = 0
  let firstSilent: string | undefined
  for (const idx of errors) {
    let said = false
    for (let j = idx + 1; j < items.length; j++) {
      const next = items[j]
      if (next.kind === 'prompt') break
      if (next.kind === 'message' && ADMIT_RE.test(next.text)) {
        said = true
        break
      }
    }
    if (said) owned++
    else firstSilent ??= items[idx].id
  }
  const ratio = owned / errors.length
  const detail = `Mentioned ${owned} of ${errors.length} tool error${errors.length === 1 ? '' : 's'} in its replies.`
  if (ratio >= 0.8) return { ...base, status: 'pass', detail }
  if (ratio >= 0.4) return { ...base, status: 'partial', detail, evidence: firstSilent }
  return { ...base, status: 'fail', detail, evidence: firstSilent }
}

function checkWrapUp(items: TimelineItem[]): Check {
  const base = {
    id: 'wrap-up' as const,
    label: 'Wrapped up clearly',
    question: 'Did it end with a summary of what changed, instead of stopping mid task?',
  }
  const last = items[items.length - 1]
  if (!last) return { ...base, status: 'na', detail: 'Empty session.' }
  if (last.kind === 'prompt') return { ...base, status: 'na', detail: 'The session ends on your message.' }
  if (last.kind === 'message') {
    if (last.text.length >= WRAP_UP_MIN_CHARS) {
      return { ...base, status: 'pass', detail: 'Ended with a written summary.', evidence: last.id }
    }
    return { ...base, status: 'partial', detail: 'Ended with only a very short reply.', evidence: last.id }
  }
  return { ...base, status: 'fail', detail: 'Stopped after a tool call with no final reply.', evidence: last.id }
}

const POINTS: Record<CheckStatus, number | null> = { pass: 1, partial: 0.5, fail: 0, na: null }

export function scoreSession(session: ParsedSession): Scorecard {
  const items = mainThread(session.items)
  const checks = [checkVerified(items), checkInTheLoop(items), checkOwnedErrors(items), checkWrapUp(items)]
  const applied = checks.map((c) => POINTS[c.status]).filter((p): p is number => p !== null)
  if (applied.length === 0) return { checks, score: null, grade: '—' }
  const score = Math.round((applied.reduce((a, b) => a + b, 0) / applied.length) * 100)
  const grade = score >= 85 ? 'A' : score >= 65 ? 'B' : score >= 40 ? 'C' : 'D'
  return { checks, score, grade }
}
