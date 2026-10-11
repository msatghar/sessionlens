import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request } from 'node:http'
import { createApp, describeHead, parseArgs, scanSessions } from '../bin/sessionlens.mjs'

let dir

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sessionlens-'))
  await mkdir(join(dir, '-home-dev-demo'))
  await writeFile(
    join(dir, '-home-dev-demo', 'one.jsonl'),
    [
      JSON.stringify({ type: 'user', cwd: '/home/dev/demo', message: { content: 'Add a login page' } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Sure' }] } }),
    ].join('\n'),
  )
  await writeFile(join(dir, 'empty.jsonl'), '')
})

afterAll(() => rm(dir, { recursive: true, force: true }))

describe('cli', () => {
  it('runs when started through a symlink, the way npx and global installs start it', async () => {
    const bin = fileURLToPath(new URL('../bin/sessionlens.mjs', import.meta.url))
    const link = join(dir, 'sessionlens-link')
    await symlink(bin, link)
    const out = execFileSync(process.execPath, [link, '--version'], { encoding: 'utf8' }).trim()
    expect(out).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('parses options', () => {
    expect(parseArgs(['--port', '5000', '--no-open'])).toMatchObject({ port: 5000, open: false })
    expect(() => parseArgs(['--port', 'abc'])).toThrow()
    expect(() => parseArgs(['--wat'])).toThrow()
  })

  it('titles a session from its first prompt and names the project from its folder', () => {
    const head = JSON.stringify({ type: 'user', cwd: '/x/my-app', message: { content: 'Fix it\nmore' } })
    expect(describeHead(head)).toEqual({ title: 'Fix it', project: 'my-app' })
  })

  it('finds logs, skips empty files and hides real paths behind ids', async () => {
    const found = await scanSessions(dir)
    expect(found).toHaveLength(1)
    expect(found[0].summary).toMatchObject({ project: 'demo', title: 'Add a login page' })
    expect(found[0].id).toMatch(/^[a-f0-9]{16}$/)
    expect(JSON.stringify(found[0].summary)).not.toContain(dir)
  })

  it('serves sessions only to localhost and refuses other hosts', async () => {
    const server = createApp({ dir, port: 0 })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address()
    // The allow list is built from the configured port, so rebuild with the real one.
    server.close()
    const app = createApp({ dir, port })
    await new Promise((r) => app.listen(port, '127.0.0.1', r))
    try {
      const ok = await fetch(`http://127.0.0.1:${port}/api/sessions`)
      expect(ok.status).toBe(200)
      const body = await ok.json()
      expect(body.sessions).toHaveLength(1)

      const one = await fetch(`http://127.0.0.1:${port}/api/sessions/${body.sessions[0].id}`)
      expect(await one.text()).toContain('Add a login page')

      // fetch() won't let us forge Host, so use a raw request like a rebinding attack would.
      const evilStatus = await new Promise((done, fail) => {
        const req = request({ host: '127.0.0.1', port, path: '/api/sessions', headers: { Host: 'evil.example' } }, (res) => {
          res.resume()
          done(res.statusCode)
        })
        req.on('error', fail)
        req.end()
      })
      expect(evilStatus).toBe(403)

      // Anything that isn't a known id never reaches the file system.
      const traversal = await fetch(`http://127.0.0.1:${port}/..%2F..%2F..%2Fetc%2Fpasswd`)
      expect(await traversal.text()).not.toContain('root:')
      const unknown = await fetch(`http://127.0.0.1:${port}/api/sessions/0000000000000000`)
      expect(unknown.status).toBe(404)

      const post = await fetch(`http://127.0.0.1:${port}/api/sessions`, { method: 'POST' })
      expect(post.status).toBe(405)
    } finally {
      app.close()
    }
  })
})
