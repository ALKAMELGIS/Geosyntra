/**
 * Fail CI if tracked git files contain likely real secrets (not dev placeholders).
 * Run: node scripts/verify-no-secrets-in-git.mjs
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

const tracked = execSync('git ls-files -z', { cwd: ROOT })
  .toString('utf8')
  .split('\0')
  .filter(Boolean)

/** @type {{ id: string, re: RegExp, allow?: (file: string, line: string) => boolean }[]} */
const rules = [
  {
    id: 'openai-sk',
    re: /\bsk-[a-zA-Z0-9]{20,}\b/,
    allow: (_f, line) => /sk-\.{3}|sk-your|example|CHANGE_ME/i.test(line),
  },
  {
    id: 'github-pat',
    re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  },
  {
    id: 'private-key',
    re: /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
    allow: (_f, line) =>
      /^\s*#/.test(line) ||
      /\\n\.\.\.|placeholder|example|your-key/i.test(line),
  },
  {
    id: 'mapbox-secret-jwt',
    re: /\bpk\.eyJ[A-Za-z0-9_-]{20,}/,
  },
  {
    id: 'aws-access-key',
    re: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    id: 'google-api-key',
    re: /\bAIza[0-9A-Za-z\-_]{35}\b/,
  },
  {
    id: 'postgres-url-with-secret',
    re: /postgres(?:ql)?:\/\/[^:\s/]+:([^@\s/]+)@/i,
    allow: (_f, line) => {
      if (/^\s*#/.test(line)) return true
      if (/\$\{PG(PASSWORD|USER)\}/.test(line)) return true
      if (/:\.\.\.@|user:pass|:\/\/[^:]*:\.\.\./i.test(line)) return true
      if (/placeholder|example|CHANGE_ME|your_.*_here/i.test(line)) return true
      const m = line.match(/postgres(?:ql)?:\/\/[^:\s/]+:([^@\s/]+)@/i)
      if (!m) return true
      const pw = decodeURIComponent(m[1])
      return /^(geosyntra|password|pass|CHANGE_ME|change-me|\*{3,}|your_.*_here)$/i.test(pw)
    },
  },
]

const skipExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.woff', '.woff2', '.ttf', '.wasm', '.br', '.gz', '.zip', '.pdf', '.ico', '.svg'])

const hits = []

for (const rel of tracked) {
  const ext = path.extname(rel).toLowerCase()
  if (skipExtensions.has(ext)) continue
  const abs = path.join(ROOT, rel)
  let text
  try {
    text = fs.readFileSync(abs, 'utf8')
  } catch {
    continue
  }
  if (text.includes('\0')) continue

  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const rule of rules) {
      if (!rule.re.test(line)) continue
      if (rule.allow?.(rel, line)) continue
      hits.push({ file: rel, line: i + 1, rule: rule.id, sample: line.trim().slice(0, 120) })
    }
  }
}

if (hits.length) {
  console.error('verify-no-secrets-in-git: possible secrets in tracked files:\n')
  for (const h of hits.slice(0, 20)) {
    console.error(`  [${h.rule}] ${h.file}:${h.line}`)
    console.error(`    ${h.sample}`)
  }
  if (hits.length > 20) console.error(`  … and ${hits.length - 20} more`)
  process.exit(1)
}

console.log(`verify-no-secrets-in-git: OK (${tracked.length} tracked files scanned)`)
