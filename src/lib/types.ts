export interface Usage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export type TimelineItem =
  | { kind: 'prompt'; id: string; ts: string; text: string }
  | { kind: 'message'; id: string; ts: string; text: string; subagent: boolean }
  | { kind: 'thinking'; id: string; ts: string; text: string; subagent: boolean }
  | {
      kind: 'tool'
      id: string
      ts: string
      name: string
      input: Record<string, unknown>
      summary: string
      output: string
      isError: boolean
      pending: boolean
      subagent: boolean
    }

export interface SessionStats {
  prompts: number
  messages: number
  toolCalls: number
  toolErrors: number
  toolsByName: Record<string, number>
  filesTouched: string[]
  commands: string[]
  usage: Usage
  models: string[]
  startedAt: string | null
  endedAt: string | null
  durationMs: number
}

export interface ParsedSession {
  id: string
  title: string
  items: TimelineItem[]
  stats: SessionStats
  /** Lines that were not valid JSON. Logs can be cut off mid write. */
  skippedLines: number
}

export interface SessionSummary {
  id: string
  project: string
  title: string
  modifiedAt: string
  sizeBytes: number
}
