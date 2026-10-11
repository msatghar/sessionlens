import { parseSession, stripHarnessTags, summarizeTool } from './parse'
import { SAMPLE_SESSIONS } from '../data/samples'

const line = (o: unknown) => JSON.stringify(o)

describe('parseSession', () => {
  it('pairs each tool call with its result and counts errors', () => {
    const s = parseSession(SAMPLE_SESSIONS[0].raw, 'a')
    const tools = s.items.filter((i) => i.kind === 'tool')
    expect(tools).toHaveLength(6)
    expect(tools.every((t) => t.kind === 'tool' && !t.pending)).toBe(true)
    expect(s.stats.toolErrors).toBe(1)
    expect(s.stats.prompts).toBe(1)
    expect(s.title).toBe('Fix wrong due dates on invoices for UTC+ customers')
  })

  it('collects edited files and shell commands', () => {
    const s = parseSession(SAMPLE_SESSIONS[0].raw)
    expect(s.stats.filesTouched).toEqual([
      '/home/dev/acme-invoices/tests/dueDate.test.ts',
      '/home/dev/acme-invoices/src/billing/dueDate.ts',
    ])
    expect(s.stats.commands).toHaveLength(2)
    expect(s.stats.toolsByName.Bash).toBe(2)
  })

  it('skips broken lines instead of throwing', () => {
    const raw = [line({ type: 'user', message: { role: 'user', content: 'hello' } }), '{"type": "assist'].join('\n')
    const s = parseSession(raw)
    expect(s.skippedLines).toBe(1)
    expect(s.stats.prompts).toBe(1)
  })

  it('hides harness tags and harness-only user turns', () => {
    const raw = [
      line({ type: 'user', message: { content: '<system-reminder>internal</system-reminder>' } }),
      line({ type: 'user', message: { content: [{ type: 'text', text: 'Fix the bug<system-reminder>x</system-reminder>' }] } }),
    ].join('\n')
    const s = parseSession(raw)
    expect(s.stats.prompts).toBe(1)
    expect(s.items[0]).toMatchObject({ kind: 'prompt', text: 'Fix the bug' })
  })

  it('counts token usage once per API message even when logged across lines', () => {
    const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 1 }
    const raw = [
      line({ type: 'assistant', message: { id: 'm1', model: 'x', content: [{ type: 'text', text: 'a' }], usage } }),
      line({ type: 'assistant', message: { id: 'm1', model: 'x', content: [{ type: 'text', text: 'b' }], usage } }),
    ].join('\n')
    const s = parseSession(raw)
    expect(s.stats.usage).toEqual({ input: 10, output: 5, cacheRead: 100, cacheWrite: 1 })
    expect(s.stats.messages).toBe(2)
  })

  it('keeps subagent work but does not count it as your prompts', () => {
    const raw = line({ type: 'user', isSidechain: true, message: { content: 'subagent task' } })
    expect(parseSession(raw).stats.prompts).toBe(0)
  })

  it('works out session duration from timestamps', () => {
    const s = parseSession(SAMPLE_SESSIONS[0].raw)
    expect(s.stats.durationMs).toBeGreaterThan(0)
  })
})

describe('helpers', () => {
  it('strips command wrappers', () => {
    expect(stripHarnessTags('<command-name>/clear</command-name>')).toBe('')
  })
  it('summarizes tool calls by their most useful field', () => {
    expect(summarizeTool('Bash', { command: 'ls', description: 'List files' })).toBe('List files')
    expect(summarizeTool('Edit', { file_path: '/a/b.ts' })).toBe('/a/b.ts')
    expect(summarizeTool('Mystery', {})).toBe('')
  })
})
