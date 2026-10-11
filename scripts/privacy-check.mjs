#!/usr/bin/env node
// Fails if any committed file contains personal details that should never be published:
// your home folder path, your OS username, your git email, and anything listed in
// .privacy-patterns (one entry per line, git-ignored so the list itself stays private).

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'

const patterns = new Set()
const add = (p) => {
  const v = (p ?? '').trim()
  if (v.length >= 4) patterns.add(v.toLowerCase())
}

add(homedir())
add(userInfo().username)
try {
  add(execFileSync('git', ['config', 'user.email'], { encoding: 'utf8' }))
} catch {}
if (existsSync('.privacy-patterns')) {
  for (const line of readFileSync('.privacy-patterns', 'utf8').split('\n')) if (!line.startsWith('#')) add(line)
}
for (const p of (process.env.SESSIONLENS_PRIVACY ?? '').split(',')) add(p)

let files
try {
  files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
} catch {
  console.error('privacy-check: run this inside the git repo.')
  process.exit(2)
}

const hits = []
for (const file of files) {
  if (!existsSync(file)) continue
  const text = readFileSync(file, 'utf8').toLowerCase()
  for (const p of patterns) if (text.includes(p)) hits.push(`${file}: contains a blocked value (${p.slice(0, 3)}…)`)
}

if (hits.length) {
  console.error('Privacy check failed. Remove these before publishing:\n' + hits.map((h) => `  ${h}`).join('\n'))
  process.exit(1)
}
console.log(`Privacy check passed: ${files.length} files, ${patterns.size} blocked values.`)
