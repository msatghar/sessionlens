import type { ParsedSession, SessionStats, TimelineItem, Usage } from './types'

type Json = Record<string, any>

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/** Claude Code wraps harness context in tags like <system-reminder>. Users never typed those. */
export function stripHarnessTags(text: string): string {
  return text
    .replace(/<(system-reminder|command-[a-z-]+|local-command-[a-z-]+)>[\s\S]*?<\/\1>/g, '')
    .trim()
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === 'string' ? b : b && typeof b === 'object' && 'text' in b ? String(b.text) : ''))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

/** One readable line describing a tool call, e.g. the command or the file it touched. */
export function summarizeTool(name: string, input: Json): string {
  const pick = (...keys: string[]) => {
    for (const k of keys) if (typeof input?.[k] === 'string' && input[k]) return input[k] as string
    return ''
  }
  switch (name) {
    case 'Bash':
      return pick('description', 'command')
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'NotebookEdit':
      return pick('file_path', 'notebook_path')
    case 'Grep':
    case 'Glob':
      return pick('pattern')
    case 'WebFetch':
    case 'WebSearch':
      return pick('url', 'query')
    case 'Task':
    case 'Agent':
      return pick('description', 'prompt')
    default:
      return pick('description', 'file_path', 'command', 'query', 'url', 'pattern')
  }
}

function emptyStats(): SessionStats {
  return {
    prompts: 0,
    messages: 0,
    toolCalls: 0,
    toolErrors: 0,
    toolsByName: {},
    filesTouched: [],
    commands: [],
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    models: [],
    startedAt: null,
    endedAt: null,
    durationMs: 0,
  }
}

function addUsage(total: Usage, u: Json | undefined) {
  if (!u) return
  total.input += Number(u.input_tokens) || 0
  total.output += Number(u.output_tokens) || 0
  total.cacheRead += Number(u.cache_read_input_tokens) || 0
  total.cacheWrite += Number(u.cache_creation_input_tokens) || 0
}

/**
 * Parse a Claude Code session log (one JSON object per line) into a timeline.
 * Tolerant by design: unknown entry types are ignored and broken lines are counted, not thrown.
 */
export function parseSession(raw: string, id = 'session'): ParsedSession {
  const items: TimelineItem[] = []
  const stats = emptyStats()
  const toolIndex = new Map<string, number>()
  const files = new Set<string>()
  const models = new Set<string>()
  const seenAssistantIds = new Set<string>()
  let title = ''
  let skippedLines = 0
  let n = 0

  const seeTimestamp = (ts: unknown) => {
    if (typeof ts !== 'string') return
    if (!stats.startedAt || ts < stats.startedAt) stats.startedAt = ts
    if (!stats.endedAt || ts > stats.endedAt) stats.endedAt = ts
  }

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    let entry: Json
    try {
      entry = JSON.parse(line)
    } catch {
      skippedLines++
      continue
    }

    if (entry.type === 'custom-title' && typeof entry.customTitle === 'string') {
      title = entry.customTitle
      continue
    }
    if (entry.type === 'summary' && typeof entry.summary === 'string' && !title) {
      title = entry.summary
      continue
    }
    if (entry.type !== 'user' && entry.type !== 'assistant') continue

    const msg = entry.message
    if (!msg || typeof msg !== 'object') continue
    const ts = typeof entry.timestamp === 'string' ? entry.timestamp : ''
    const subagent = Boolean(entry.isSidechain)
    seeTimestamp(ts)

    if (entry.type === 'assistant') {
      if (typeof msg.model === 'string' && !msg.model.startsWith('<')) models.add(msg.model)
      // One API response can be logged across several lines; count its usage once.
      const msgId = typeof msg.id === 'string' ? msg.id : ''
      if (!msgId || !seenAssistantIds.has(msgId)) {
        if (msgId) seenAssistantIds.add(msgId)
        addUsage(stats.usage, msg.usage)
      }
    }

    const blocks: Json[] = Array.isArray(msg.content)
      ? msg.content
      : typeof msg.content === 'string'
        ? [{ type: 'text', text: msg.content }]
        : []

    for (const block of blocks) {
      if (!block || typeof block !== 'object') continue
      const itemId = `${id}:${n++}`

      if (entry.type === 'user' && block.type === 'text') {
        const text = stripHarnessTags(String(block.text ?? ''))
        if (!text || subagent) continue
        items.push({ kind: 'prompt', id: itemId, ts, text })
        stats.prompts++
        if (!title) title = text.split('\n')[0].slice(0, 90)
      } else if (entry.type === 'user' && block.type === 'tool_result') {
        const at = toolIndex.get(String(block.tool_use_id))
        if (at === undefined) continue
        const tool = items[at]
        if (tool.kind !== 'tool') continue
        tool.output = textOf(block.content)
        tool.isError = Boolean(block.is_error)
        tool.pending = false
        if (tool.isError) stats.toolErrors++
      } else if (entry.type === 'assistant' && block.type === 'text') {
        const text = String(block.text ?? '').trim()
        if (!text) continue
        items.push({ kind: 'message', id: itemId, ts, text, subagent })
        stats.messages++
      } else if (entry.type === 'assistant' && block.type === 'thinking') {
        const text = String(block.thinking ?? '').trim()
        if (!text) continue
        items.push({ kind: 'thinking', id: itemId, ts, text, subagent })
      } else if (entry.type === 'assistant' && block.type === 'tool_use') {
        const name = String(block.name ?? 'tool')
        const input: Json = block.input && typeof block.input === 'object' ? block.input : {}
        items.push({
          kind: 'tool',
          id: itemId,
          ts,
          name,
          input,
          summary: summarizeTool(name, input),
          output: '',
          isError: false,
          pending: true,
          subagent,
        })
        toolIndex.set(String(block.id), items.length - 1)
        stats.toolCalls++
        stats.toolsByName[name] = (stats.toolsByName[name] ?? 0) + 1
        if (EDIT_TOOLS.has(name)) {
          const path = input.file_path ?? input.notebook_path
          if (typeof path === 'string') files.add(path)
        }
        if (name === 'Bash' && typeof input.command === 'string') stats.commands.push(input.command)
      }
    }
  }

  stats.filesTouched = [...files]
  stats.models = [...models]
  if (stats.startedAt && stats.endedAt) {
    stats.durationMs = Math.max(0, Date.parse(stats.endedAt) - Date.parse(stats.startedAt))
  }

  return { id, title: title || 'Untitled session', items, stats, skippedLines }
}
