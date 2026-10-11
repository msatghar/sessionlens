// Synthetic demo sessions. Everything here is invented: the projects, paths, people and code.
// They are written in the same line format Claude Code uses, so the demo runs the real parser.

import type { SessionSummary } from '../lib/types'

type Step =
  | { user: string }
  | { say: string }
  | { think: string }
  | { tool: string; input: Record<string, unknown>; out: string; error?: boolean }

interface SampleSpec {
  id: string
  project: string
  title: string
  start: string
  model: string
  steps: Step[]
}

function toJsonl(spec: SampleSpec): string {
  const lines: string[] = [JSON.stringify({ type: 'custom-title', customTitle: spec.title, sessionId: spec.id })]
  let t = Date.parse(spec.start)
  let n = 0
  const tick = (seconds: number) => {
    t += seconds * 1000
    return new Date(t).toISOString()
  }
  const usage = (i: number, o: number) => ({
    input_tokens: i,
    output_tokens: o,
    cache_read_input_tokens: i * 6,
    cache_creation_input_tokens: Math.round(i / 3),
  })

  for (const step of spec.steps) {
    n++
    if ('user' in step) {
      lines.push(
        JSON.stringify({
          type: 'user',
          timestamp: tick(20),
          sessionId: spec.id,
          message: { role: 'user', content: step.user },
        }),
      )
    } else if ('say' in step || 'think' in step) {
      const block = 'say' in step ? { type: 'text', text: step.say } : { type: 'thinking', thinking: step.think }
      lines.push(
        JSON.stringify({
          type: 'assistant',
          timestamp: tick(6),
          sessionId: spec.id,
          message: { id: `msg_${spec.id}_${n}`, role: 'assistant', model: spec.model, content: [block], usage: usage(900, 220) },
        }),
      )
    } else {
      const toolId = `toolu_${spec.id}_${n}`
      lines.push(
        JSON.stringify({
          type: 'assistant',
          timestamp: tick(4),
          sessionId: spec.id,
          message: {
            id: `msg_${spec.id}_${n}`,
            role: 'assistant',
            model: spec.model,
            content: [{ type: 'tool_use', id: toolId, name: step.tool, input: step.input }],
            usage: usage(1400, 160),
          },
        }),
      )
      lines.push(
        JSON.stringify({
          type: 'user',
          timestamp: tick(step.tool === 'Bash' ? 11 : 2),
          sessionId: spec.id,
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: toolId, content: step.out, is_error: Boolean(step.error) }],
          },
        }),
      )
    }
  }
  return lines.join('\n')
}

const good: SampleSpec = {
  id: 'demo-invoices',
  project: 'acme-invoices',
  title: 'Fix wrong due dates on invoices for UTC+ customers',
  start: '2026-03-04T15:02:00Z',
  model: 'claude-sonnet-4-5',
  steps: [
    {
      user: 'Customers in Tokyo say their invoice due dates show one day early. Can you find out why and fix it? Tests are in tests/.',
    },
    { think: 'Due dates are probably built from a date string parsed as UTC midnight, then shown in local time.' },
    { say: "I'll start by finding where due dates are computed and how they're formatted." },
    { tool: 'Grep', input: { pattern: 'dueDate' }, out: 'src/billing/dueDate.ts\nsrc/ui/InvoiceRow.tsx\ntests/dueDate.test.ts' },
    {
      tool: 'Read',
      input: { file_path: '/home/dev/acme-invoices/src/billing/dueDate.ts' },
      out: "export function dueDate(issued: string, netDays: number) {\n  const d = new Date(issued)\n  d.setDate(d.getDate() + netDays)\n  return d.toISOString().slice(0, 10)\n}",
    },
    {
      say: "Found it. `new Date('2026-03-01')` is UTC midnight, but `setDate` works in local time, so for UTC+ zones the date slips back a day before we add the terms. I'll reproduce it in a test first.",
    },
    {
      tool: 'Edit',
      input: { file_path: '/home/dev/acme-invoices/tests/dueDate.test.ts', old_string: '', new_string: "it('keeps the day in Asia/Tokyo')" },
      out: 'The file was updated.',
    },
    {
      tool: 'Bash',
      input: { command: 'TZ=Asia/Tokyo npx vitest run tests/dueDate.test.ts', description: 'Run due date tests in Tokyo time' },
      out: 'FAIL tests/dueDate.test.ts > keeps the day in Asia/Tokyo\nExpected "2026-03-31", received "2026-03-30"',
      error: true,
    },
    { say: 'The new test fails as expected, which confirms the bug. Now the fix: do the date math in UTC end to end.' },
    {
      tool: 'Edit',
      input: { file_path: '/home/dev/acme-invoices/src/billing/dueDate.ts', old_string: 'd.setDate(d.getDate() + netDays)', new_string: 'd.setUTCDate(d.getUTCDate() + netDays)' },
      out: 'The file was updated.',
    },
    {
      tool: 'Bash',
      input: { command: 'TZ=Asia/Tokyo npx vitest run && TZ=America/Los_Angeles npx vitest run', description: 'Run the full suite in two time zones' },
      out: 'Test Files  14 passed (14)\nTests  96 passed (96)\n\nTest Files  14 passed (14)\nTests  96 passed (96)',
    },
    {
      say: 'Fixed. Due dates were computed in local time from a date that was parsed as UTC, so anyone east of UTC saw them a day early.\n\nWhat changed:\n- `src/billing/dueDate.ts` now adds payment terms with UTC date methods.\n- `tests/dueDate.test.ts` has a new test that fails without the fix.\n\nThe full suite passes in both Tokyo and Los Angeles time. Existing invoices are not affected because due dates are computed when they are displayed.',
    },
  ],
}

const ok: SampleSpec = {
  id: 'demo-darkmode',
  project: 'pebble-notes',
  title: 'Add a dark mode toggle to settings',
  start: '2026-03-06T19:40:00Z',
  model: 'claude-sonnet-4-5',
  steps: [
    { user: 'Add a dark mode toggle to the settings page. Remember the choice between visits.' },
    { say: "I'll check how theming works today, then add the toggle and persist it." },
    { tool: 'Glob', input: { pattern: 'src/**/*theme*' }, out: 'src/styles/theme.css\nsrc/hooks/useTheme.ts' },
    { tool: 'Read', input: { file_path: '/home/dev/pebble-notes/src/hooks/useTheme.ts' }, out: 'export function useTheme() { return "light" }' },
    {
      tool: 'Write',
      input: { file_path: '/home/dev/pebble-notes/src/hooks/useTheme.ts', content: '// theme hook with localStorage' },
      out: 'The file was written.',
    },
    { tool: 'Bash', input: { command: 'npm run build', description: 'Build the app' }, out: "src/pages/Settings.tsx(12,3): error TS2304: Cannot find name 'ThemeToggle'.", error: true },
    { say: "The build failed because Settings doesn't import the new toggle yet. Adding the component now." },
    {
      tool: 'Write',
      input: { file_path: '/home/dev/pebble-notes/src/components/ThemeToggle.tsx', content: '// toggle' },
      out: 'The file was written.',
    },
    { tool: 'Bash', input: { command: 'npm run build', description: 'Build again' }, out: 'built in 2.1s' },
    {
      tool: 'Edit',
      input: { file_path: '/home/dev/pebble-notes/src/styles/theme.css', old_string: ':root {', new_string: ':root[data-theme="dark"] {' },
      out: 'The file was updated.',
    },
    { say: 'Added the dark mode toggle. It is saved to localStorage and applied before first paint.' },
  ],
}

const silent: SampleSpec = {
  id: 'demo-search',
  project: 'shopfront-api',
  title: 'Speed up the product search endpoint',
  start: '2026-03-09T13:15:00Z',
  model: 'claude-sonnet-4-5',
  steps: [
    { user: 'The /search endpoint takes 2 to 3 seconds. Make it faster.' },
    { tool: 'Grep', input: { pattern: 'router.get\\(.?/search' }, out: 'src/routes/search.ts' },
    { tool: 'Read', input: { file_path: '/home/dev/shopfront-api/src/routes/search.ts' }, out: 'const rows = await db.query(`SELECT * FROM products WHERE name ILIKE $1`)' },
    { tool: 'Read', input: { file_path: '/home/dev/shopfront-api/src/db/schema.sql' }, out: 'CREATE TABLE products (id serial, name text, ...);' },
    { tool: 'Bash', input: { command: 'psql -c "EXPLAIN ANALYZE SELECT * FROM products WHERE name ILIKE \'%lamp%\'"' }, out: 'psql: error: connection refused', error: true },
    { tool: 'Read', input: { file_path: '/home/dev/shopfront-api/docker-compose.yml' }, out: 'services:\n  db:\n    image: postgres:16' },
    { tool: 'Grep', input: { pattern: 'CREATE INDEX' }, out: 'No matches found' },
    { tool: 'Read', input: { file_path: '/home/dev/shopfront-api/src/db/migrations/001_init.sql' }, out: '-- initial schema' },
    { tool: 'Write', input: { file_path: '/home/dev/shopfront-api/src/db/migrations/014_trgm_index.sql', content: 'CREATE INDEX ...' }, out: 'The file was written.' },
    { tool: 'Edit', input: { file_path: '/home/dev/shopfront-api/src/routes/search.ts', old_string: 'SELECT *', new_string: 'SELECT id, name, price' }, out: 'The file was updated.' },
    { tool: 'Read', input: { file_path: '/home/dev/shopfront-api/src/routes/search.ts' }, out: '...' },
    { tool: 'Edit', input: { file_path: '/home/dev/shopfront-api/src/routes/search.ts', old_string: 'ILIKE $1', new_string: 'ILIKE $1 LIMIT 50' }, out: 'The file was updated.' },
    { tool: 'Grep', input: { pattern: 'searchProducts' }, out: 'src/routes/search.ts\nsrc/web/api.ts' },
    { tool: 'Read', input: { file_path: '/home/dev/shopfront-api/src/web/api.ts' }, out: '...' },
    { tool: 'Edit', input: { file_path: '/home/dev/shopfront-api/src/web/api.ts', old_string: 'page=1', new_string: 'page=1&limit=50' }, out: 'The file was updated.' },
    { tool: 'Bash', input: { command: 'npm run migrate' }, out: 'Error: connect ECONNREFUSED 127.0.0.1:5432', error: true },
    { tool: 'Read', input: { file_path: '/home/dev/shopfront-api/package.json' }, out: '{ "scripts": { ... } }' },
    { tool: 'Edit', input: { file_path: '/home/dev/shopfront-api/src/routes/search.ts', old_string: 'LIMIT 50', new_string: 'LIMIT $2' }, out: 'The file was updated.' },
  ],
}

const SPECS = [good, ok, silent]

export const SAMPLE_SESSIONS: { summary: SessionSummary; raw: string }[] = SPECS.map((spec) => {
  const raw = toJsonl(spec)
  return {
    raw,
    summary: {
      id: spec.id,
      project: spec.project,
      title: spec.title,
      modifiedAt: spec.start,
      sizeBytes: raw.length,
    },
  }
})
