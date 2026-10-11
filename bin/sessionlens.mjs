#!/usr/bin/env node
// sessionlens: a local viewer for Claude Code session logs.
// Privacy: binds to 127.0.0.1 only, rejects other Host headers, makes no outbound requests,
// and never sends your logs anywhere. Files are read from disk only when you open them.

import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, realpathSync } from 'node:fs'
import { open, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const DIST = resolve(HERE, '..', 'dist')
const VERSION = JSON.parse(readFileSync(resolve(HERE, '..', 'package.json'), 'utf8')).version
const HEAD_BYTES = 256 * 1024

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
}

const HELP = `sessionlens ${VERSION}
See what your AI coding agent actually did.

Usage: sessionlens [options]

Options:
  --dir <path>   Folder with session logs (default: ~/.claude/projects)
  --port <n>     Port to listen on (default: 4317)
  --no-open      Don't open the browser
  -v, --version  Print the version
  -h, --help     Show this help

Everything stays on your machine. The server only listens on 127.0.0.1.`

export function parseArgs(argv) {
  const opts = { dir: join(homedir(), '.claude', 'projects'), port: 4317, open: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dir') opts.dir = resolve(argv[++i] ?? '')
    else if (a === '--port') opts.port = Number(argv[++i])
    else if (a === '--no-open') opts.open = false
    else if (a === '-h' || a === '--help') opts.help = true
    else if (a === '-v' || a === '--version') opts.version = true
    else throw new Error(`Unknown option: ${a}`)
  }
  if (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535) throw new Error('--port must be 1 to 65535')
  return opts
}

const stripTags = (t) =>
  t.replace(/<(system-reminder|command-[a-z-]+|local-command-[a-z-]+)>[\s\S]*?<\/\1>/g, '').trim()

/** Read the start of a log to find its title and working folder without loading the whole file. */
async function readHead(path) {
  const fh = await open(path, 'r')
  try {
    const buf = Buffer.alloc(HEAD_BYTES)
    const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0)
    return buf.subarray(0, bytesRead).toString('utf8')
  } finally {
    await fh.close()
  }
}

export function describeHead(head) {
  let title = ''
  let firstPrompt = ''
  let cwd = ''
  for (const line of head.split('\n')) {
    let e
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }
    if (e.type === 'custom-title' && e.customTitle) title = e.customTitle
    if (e.type === 'summary' && e.summary && !title) title = e.summary
    if (!cwd && typeof e.cwd === 'string') cwd = e.cwd
    if (!firstPrompt && e.type === 'user' && !e.isSidechain && e.message) {
      const c = e.message.content
      const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b?.type === 'text').map((b) => b.text).join(' ') : ''
      const clean = stripTags(text)
      if (clean) firstPrompt = clean.split('\n')[0].slice(0, 90)
    }
  }
  return { title: title || firstPrompt || 'Untitled session', project: cwd ? basename(cwd) : '' }
}

/** Find *.jsonl logs one or two levels deep. Returns opaque ids so paths never reach the browser. */
export async function scanSessions(dir) {
  const found = []
  const visit = async (folder, depth) => {
    let entries
    try {
      entries = await readdir(folder, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const full = join(folder, ent.name)
      if (ent.isDirectory() && depth < 1 && !ent.name.startsWith('.')) await visit(full, depth + 1)
      else if (ent.isFile() && ent.name.endsWith('.jsonl')) found.push(full)
    }
  }
  await visit(dir, 0)

  const sessions = []
  for (const path of found) {
    try {
      const st = await stat(path)
      if (st.size === 0) continue
      const head = await readHead(path)
      const { title, project } = describeHead(head)
      const id = createHash('sha256').update(path).digest('hex').slice(0, 16)
      sessions.push({
        id,
        path,
        summary: {
          id,
          project: project || basename(join(path, '..')).replace(/^-+/, ''),
          title,
          modifiedAt: st.mtime.toISOString(),
          sizeBytes: st.size,
        },
      })
    } catch {
      // Unreadable file: skip it.
    }
  }
  sessions.sort((a, b) => b.summary.modifiedAt.localeCompare(a.summary.modifiedAt))
  return sessions
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

export function createApp({ dir, port }) {
  let cache = null
  const sessions = async (refresh) => {
    if (!cache || refresh) cache = await scanSessions(dir)
    return cache
  }
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])

  return createServer(async (req, res) => {
    // Block DNS rebinding: only answer requests addressed to this machine.
    if (!allowedHosts.has(req.headers.host ?? '')) return send(res, 403, { error: 'Forbidden host' })
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' })

    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    try {
      if (url.pathname === '/api/sessions') {
        const list = await sessions(url.searchParams.has('refresh'))
        return send(res, 200, { dir: dir.replace(homedir(), '~'), sessions: list.map((s) => s.summary) })
      }
      const m = url.pathname.match(/^\/api\/sessions\/([a-f0-9]{16})$/)
      if (m) {
        const hit = (await sessions(false)).find((s) => s.id === m[1])
        if (!hit) return send(res, 404, { error: 'Not found' })
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
        return createReadStream(hit.path).pipe(res)
      }

      // Static files for the UI, with index.html as the fallback.
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
      let file = resolve(DIST, rel)
      if (!file.startsWith(DIST + sep) || !existsSync(file) || (await stat(file)).isDirectory()) {
        file = join(DIST, 'index.html')
      }
      if (!existsSync(file)) return send(res, 500, { error: 'UI not built. Run: npm run build' })
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
      return createReadStream(file).pipe(res)
    } catch (err) {
      return send(res, 500, { error: String(err?.message ?? err) })
    }
  })
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'
  execFile(cmd, [url], () => {})
}

async function main() {
  let opts
  try {
    opts = parseArgs(process.argv.slice(2))
  } catch (err) {
    console.error(String(err.message))
    console.error('Run sessionlens --help for usage.')
    process.exit(2)
  }
  if (opts.help) return console.log(HELP)
  if (opts.version) return console.log(VERSION)
  if (!existsSync(opts.dir)) {
    console.error(`No session folder at ${opts.dir}. Point to one with --dir.`)
    process.exit(1)
  }

  const server = createApp(opts)
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') console.error(`Port ${opts.port} is busy. Try --port ${opts.port + 1}.`)
    else console.error(err.message)
    process.exit(1)
  })
  server.listen(opts.port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${opts.port}`
    console.log(`sessionlens is running at ${url}`)
    console.log(`Reading logs from ${opts.dir.replace(homedir(), '~')} (stays on this machine)`)
    console.log('Press Ctrl+C to stop.')
    if (opts.open) openBrowser(url)
  })
}

// npx and global installs start us through a symlink in node_modules/.bin, so compare real paths.
const isEntry = (() => {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()
if (isEntry) main()
