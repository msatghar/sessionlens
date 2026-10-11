import { SAMPLE_SESSIONS } from '../data/samples'
import type { SessionSummary } from './types'

export interface SessionSource {
  mode: 'local' | 'demo'
  folder: string
  sessions: SessionSummary[]
  load: (id: string) => Promise<string>
}

const demo: SessionSource = {
  mode: 'demo',
  folder: 'sample data',
  sessions: SAMPLE_SESSIONS.map((s) => s.summary),
  load: async (id) => SAMPLE_SESSIONS.find((s) => s.summary.id === id)?.raw ?? '',
}

/** Use the local CLI server when it is there; otherwise fall back to the bundled samples. */
export async function connect(refresh = false): Promise<SessionSource> {
  if (__DEMO__) return demo
  try {
    const res = await fetch(`/api/sessions${refresh ? '?refresh' : ''}`)
    if (!res.ok) throw new Error(String(res.status))
    const body = (await res.json()) as { dir: string; sessions: SessionSummary[] }
    return {
      mode: 'local',
      folder: body.dir,
      sessions: body.sessions,
      load: async (id) => {
        const r = await fetch(`/api/sessions/${id}`)
        if (!r.ok) throw new Error(`Could not load session (${r.status})`)
        return r.text()
      },
    }
  } catch {
    return demo
  }
}
